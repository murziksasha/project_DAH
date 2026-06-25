import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>DAH</h1>
        <p style={{ color: 'var(--muted)' }}>
          Сучасний сервіс для управління ОСМД — фінанси, внески, прозорість
        </p>
      </div>

      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        <Link href="/login" className="card" style={{ display: 'block' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Увійти</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Кабінет правління, бухгалтера або мешканця
          </p>
        </Link>
        <Link href="/register" className="card" style={{ display: 'block' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Реєстрація</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Мешканець: вкажіть квартиру та очікуйте підтвердження
          </p>
        </Link>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Можливості MVP</h3>
        <ul style={{ color: 'var(--muted)', paddingLeft: '1.25rem', display: 'grid', gap: '0.5rem' }}>
          <li>Облік витрат по фондах (утримання, капремонт)</li>
          <li>Нарахування та лицеві рахунки квартир</li>
          <li>Звіт руху коштів у реальному часі</li>
          <li>Прозорість для мешканців (PWA)</li>
          <li>Оголошення, заявки, опитування</li>
        </ul>
      </div>

      <p style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
        Встановіть на екран телефону — працює як застосунок (PWA)
      </p>
    </main>
  );
}