import Link from "next/link";

export default function HomePage() {
  return (
    <section className="page">
      <div className="empty">
        <div className="kicker">FOREX BOOK LAB</div>
        <h1>Book → Function</h1>
        <p>책 내용을 복사하는 사이트가 아니라, 책에 나오는 pip·lot·market phase·trend stage·swing·trendline distance·fakeout·position sizing·stop-loss·R:R를 직접 계산하고 실습하는 사이트입니다.</p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginTop:24}}>
          <Link href="/book-tools" style={{padding:"12px 16px",border:"1px solid #d7ff46",borderRadius:10,color:"#d7ff46"}}>Book Tools</Link>
          <Link href="/book" style={{padding:"12px 16px",border:"1px solid #394456",borderRadius:10}}>Book Reference</Link>
          <Link href="/chart-lab" style={{padding:"12px 16px",border:"1px solid #394456",borderRadius:10}}>Chart Lab</Link>
          <Link href="/scanner" style={{padding:"12px 16px",border:"1px solid #394456",borderRadius:10}}>Scanner</Link>
        </div>
      </div>
    </section>
  );
}
