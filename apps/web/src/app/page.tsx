import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.25rem', marginBottom: '0.5rem', letterSpacing: '-0.03em' }}>
          DAH
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '1.05rem', maxWidth: 480, margin: '0 auto' }}>
          Self-hosted кабінет ОСМД: фінанси, внески, прозорість і комунікації — на вашому ноутбуці
          або сервері (KeenDNS / LAN).
        </p>
      </div>

      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        <Link href="/login" className="card" style={{ display: 'block', color: 'inherit' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Увійти</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Правління, бухгалтер, ревізія або мешканець
          </p>
        </Link>
        <Link href="/register" className="card" style={{ display: 'block', color: 'inherit' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Реєстрація</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Мешканець: квартира + підтвердження правлінням
          </p>
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Для правління</h3>
        <ul
          style={{
            color: 'var(--muted)',
            paddingLeft: '1.25rem',
            display: 'grid',
            gap: '0.45rem',
            fontSize: '0.95rem',
          }}
        >
          <li>Витрати, постачальники, фонди та IBAN</li>
          <li>Нарахування (майстер), FIFO-платежі, імпорт виписки CSV</li>
          <li>Звіти, PDF для зборів, email боржникам</li>
          <li>2FA, аудит, backup, ops-панель</li>
        </ul>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Для мешканців</h3>
        <ul
          style={{
            color: 'var(--muted)',
            paddingLeft: '1.25rem',
            display: 'grid',
            gap: '0.45rem',
            fontSize: '0.95rem',
          }}
        >
          <li>Особовий рахунок, PDF-квитанції, реквізити для оплати</li>
          <li>Прозорість витрат дому, документи, боржники (за налаштуванням)</li>
          <li>Оголошення, заявки, опитування, Web Push (PWA)</li>
        </ul>
      </div>

      <p
        style={{
          textAlign: 'center',
          marginTop: '2rem',
          color: 'var(--muted)',
          fontSize: '0.85rem',
        }}
      >
        Встановіть на екран телефону — працює як застосунок (PWA)
      </p>
    </main>
  );
}
