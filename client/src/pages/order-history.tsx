import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package, Calendar, DollarSign, ChevronRight, RefreshCw, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Order, OrderItem, Supply, Pet, Refund } from "@shared/schema";
import { safeGoBack } from "@/lib/navigation";

interface OrderWithDetails extends Order {
  items?: OrderItem[];
  supplies?: Supply[];
  pets?: Pet[];
  refunds?: Refund[];
}

export default function OrderHistory() {
  const [, setLocation] = useLocation();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "delivered":
        return "bg-green-500";
      case "shipped":
        return "bg-blue-500";
      case "confirmed":
        return "bg-yellow-500";
      case "cancelled":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleOrderClick = async (order: Order) => {
    try {
      const [orderResponse, refundsResponse] = await Promise.all([
        fetch(`/api/orders/${order.id}`, {
          credentials: 'include',
        }),
        fetch(`/api/refunds?orderId=${order.id}`, {
          credentials: 'include',
        }),
      ]);

      let items: OrderItem[] = [];
      let refunds: Refund[] = [];

      if (orderResponse.ok) {
        const orderDetails = await orderResponse.json();
        items = orderDetails.items || [];
      }

      if (refundsResponse.ok) {
        refunds = await refundsResponse.json();
      }

      setSelectedOrder({ ...order, items, refunds });
    } catch (error) {
      console.error("Error fetching order details:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Fixed Back Button */}
      <div className="fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={safeGoBack}
          className="bg-white shadow-lg hover:bg-gray-100 rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-brand-blue to-brand-red text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center pl-12">
          <div>
            <h1 className="text-2xl font-bold">Order History</h1>
            <p className="text-sm text-white/80">View your past purchases</p>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue"></div>
            <p className="text-gray-500 mt-2">Loading orders...</p>
          </div>
        ) : !orders || orders.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Orders Yet</h3>
              <p className="text-gray-500 mb-4">You haven't placed any orders yet.</p>
              <Button
                onClick={() => setLocation("/supplies")}
                className="bg-brand-blue hover:bg-blue-600"
                data-testid="button-shop-now"
              >
                Start Shopping
              </Button>
            </CardContent>
          </Card>
        ) : (
          orders.map((order) => (
            <Card
              key={order.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleOrderClick(order)}
              data-testid={`card-order-${order.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500">Order #{order.id}</p>
                      {order.isRecurring && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-blue-300 text-blue-600">
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Recurring
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center mt-1 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-1" />
                      {formatDate(order.orderDate || new Date())}
                    </div>
                  </div>
                  <Badge className={getStatusColor(order.status || "pending")}>
                    {getStatusLabel(order.status || "pending")}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-lg font-bold text-gray-900">
                    <DollarSign className="w-5 h-5 text-brand-green" />
                    {order.totalAmount}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Order Details Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Order Number</p>
                    <p className="font-semibold">#{selectedOrder.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Date</p>
                    <p className="font-semibold">{formatDate(selectedOrder.orderDate || new Date())}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <Badge className={getStatusColor(selectedOrder.status || "pending")}>
                      {getStatusLabel(selectedOrder.status || "pending")}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="font-bold text-brand-green">${selectedOrder.totalAmount}</p>
                  </div>
                </div>
              </div>

              {selectedOrder.shippingAddress && (
                <div>
                  <h3 className="font-semibold mb-2">Shipping Address</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{selectedOrder.shippingAddress}</p>
                </div>
              )}

              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Order Items</h3>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, index) => (
                      <div key={item.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex-1">
                          <p className="font-medium">
                            {item.supplyId ? `Supply #${item.supplyId}` : `Pet #${item.petId}`}
                          </p>
                          <p className="text-sm text-gray-500">Quantity: {item.quantity}</p>
                        </div>
                        <p className="font-semibold">${item.price}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refunds Section */}
              {selectedOrder.refunds && selectedOrder.refunds.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2 flex items-center">
                    <RotateCcw className="w-4 h-4 mr-2 text-orange-500" />
                    Refunds Applied
                  </h3>
                  <div className="space-y-2">
                    {selectedOrder.refunds.map((refund) => (
                      <div key={refund.id} className="p-3 bg-orange-50 rounded border border-orange-200">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-600">
                            {formatDate(refund.refundDate || new Date())}
                          </span>
                          <span className="font-bold text-orange-600">
                            -${refund.refundAmount}
                          </span>
                        </div>
                        {refund.reason && (
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Reason:</span> {refund.reason}
                          </p>
                        )}
                        {refund.notes && (
                          <p className="text-sm text-gray-500 mt-1">{refund.notes}</p>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-orange-200">
                      <span className="font-medium text-gray-700">Total Refunded:</span>
                      <span className="font-bold text-orange-600">
                        -${selectedOrder.refunds.reduce((sum, r) => sum + parseFloat(r.refundAmount), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Recurring Order Info */}
              {selectedOrder.isRecurring && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2 flex items-center">
                    <RefreshCw className="w-4 h-4 mr-2 text-blue-500" />
                    Recurring Order
                  </h3>
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Frequency:</span>{' '}
                      {selectedOrder.recurringFrequency === 'weekly' ? 'Weekly' :
                       selectedOrder.recurringFrequency === 'biweekly' ? 'Every 2 Weeks' : 'Monthly'}
                    </p>
                    {selectedOrder.nextRecurringDate && (
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Next Order:</span>{' '}
                        {formatDate(selectedOrder.nextRecurringDate)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
