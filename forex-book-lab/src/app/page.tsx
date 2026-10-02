import Link from "next/link";

export default function HomePage() {
  return (
    <section className="page">
      <div className="empty">
        <div className="kicker">FOREX BOOK LAB</div>
        <h1>Learn · Calculate · Practice</h1>
        <p>원본 교재를 페이지별로 구현하면서 계산기, 차트 실습, 캔들 패턴, 학습 메모와 실전 체크리스트를 함께 연결한 독립 Forex 학습 사이트입니다.</p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginTop:24}}>
          <Link href="/book" style={{padding:"12px 16px",border:"1px solid #394456",borderRadius:10}}>Book</Link>
          <Link href="/chart-lab" style={{padding:"12px 16px",border:"1px solid #394456",borderRadius:10}}>Chart Lab</Link>
          <Link href="/scanner" style={{padding:"12px 16px",border:"1px solid #394456",borderRadius:10}}>Scanner</Link>
        </div>
      </div>
    </section>
  );
}
