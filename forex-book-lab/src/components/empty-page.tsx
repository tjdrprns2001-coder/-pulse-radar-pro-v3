export function EmptyPage({ section, title, description }: { section: string; title: string; description: string }) {
  return (
    <section className="page">
      <div className="empty">
        <div className="kicker">{section}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
