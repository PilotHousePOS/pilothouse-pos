export default function About() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '40px 20px', color: '#111' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>PilotHouse</h1>
      <p style={{ fontSize: '1.1rem', marginBottom: '24px', color: '#444' }}>The all-in-one platform for small business operations.</p>

      <h2 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>About Us</h2>
      <p style={{ marginBottom: '20px' }}>
        PilotHouse is a full-service business management platform built for small businesses.
        We provide POS, inventory management, loyalty rewards, appointment booking, and automated reporting
        so you can focus on running your business.
      </p>

      <h2 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>Features</h2>
      <ul style={{ marginBottom: '20px', paddingLeft: '20px' }}>
        <li>Point-of-sale with hardware integration</li>
        <li>Online store with in-store pickup</li>
        <li>Customer loyalty rewards program</li>
        <li>Service appointment booking with automated reminders</li>
        <li>Daily and periodic sales reporting</li>
        <li>Inventory and product management</li>
      </ul>

      <p style={{ marginTop: '40px', fontSize: '0.9rem', color: '#777' }}>
        &copy; {new Date().getFullYear()} PilotHouse. All rights reserved.
      </p>
    </div>
  );
}
