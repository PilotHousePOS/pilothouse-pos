export default function About() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '40px 20px', color: '#111' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Animal House Pet Store</h1>
      <p style={{ fontSize: '1.1rem', marginBottom: '24px', color: '#444' }}>West Monroe, Louisiana's premier destination for exotic pets, supplies, and professional grooming services.</p>

      <h2 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>About Us</h2>
      <p style={{ marginBottom: '20px' }}>
        Animal House Pet Store is a full-service exotic pet retailer and grooming salon serving West Monroe, Louisiana and the surrounding area.
        We specialize in exotic reptiles, aquatic animals, premium pet supplies, and professional dog and cat grooming services.
        Our mission is to be the premier online and in-store destination for exotic pet owners, fostering customer loyalty and providing unmatched quality care.
      </p>

      <h2 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>Services</h2>
      <ul style={{ marginBottom: '20px', paddingLeft: '20px' }}>
        <li>Professional dog and cat grooming (Bath Only &amp; Full Grooming)</li>
        <li>Exotic reptile sales and care</li>
        <li>Aquatic animals and supplies</li>
        <li>Premium pet food, treats, and accessories</li>
        <li>Online ordering with in-store pickup</li>
      </ul>

      <h2 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>Contact</h2>
      <p style={{ marginBottom: '8px' }}>Business: West Monroe Animal House</p>
      <p style={{ marginBottom: '8px' }}>Email: <a href="mailto:tgskipbusiness@gmail.com">tgskipbusiness@gmail.com</a></p>
      <p style={{ marginBottom: '8px' }}>Phone: (318) 816-0684</p>
      <p style={{ marginBottom: '8px' }}>Website: <a href="https://animalhousepetstore.com">https://animalhousepetstore.com</a></p>

      <p style={{ marginTop: '40px', fontSize: '0.9rem', color: '#777' }}>
        &copy; {new Date().getFullYear()} Animal House Pet Store. All rights reserved.
      </p>
    </div>
  );
}
