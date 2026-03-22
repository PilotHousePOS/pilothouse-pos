import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { verifyToken } from './auth';
import type { JWTUser } from './auth';

interface AuthenticatedWebSocket extends WebSocket {
  user?: JWTUser;
  isAlive?: boolean;
}

class NotificationWebSocketServer {
  private wss: WebSocketServer;
  private adminClients: Set<AuthenticatedWebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Heartbeat mechanism to keep connections alive
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.isAlive === false) {
          ws.terminate();
          this.adminClients.delete(ws);
          return;
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  private handleConnection(ws: AuthenticatedWebSocket, request: any) {
    ws.isAlive = true;

    // Extract token from cookie header (sent automatically by browser) or fallback to query param/auth header
    const cookieHeader = request.headers.cookie || '';
    const cookieToken = cookieHeader.split(';').map((c: string) => c.trim()).find((c: string) => c.startsWith('auth_token='))?.split('=').slice(1).join('=') || '';
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = cookieToken || url.searchParams.get('token') || request.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const user = verifyToken(token);
      if (user && user.isAdmin) {
        ws.user = user;
        this.adminClients.add(ws);
      }
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      this.adminClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.adminClients.delete(ws);
    });
  }

  public broadcastToAdmins(notification: {
    notificationType: 'order' | 'appointment';
    title: string;
    message: string;
  }) {
    const message = JSON.stringify({
      type: 'admin_notification',
      ...notification,
      timestamp: new Date().toISOString()
    });

    this.adminClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Error sending WebSocket message:', error);
          this.adminClients.delete(client);
        }
      } else {
        this.adminClients.delete(client);
      }
    });

  }
}

export default NotificationWebSocketServer;