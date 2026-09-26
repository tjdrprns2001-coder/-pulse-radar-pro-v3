import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'IGNITION — 선물 검색기',description:'전체 시장에서 점화 전 후보까지. Binance USDT 선물 독립 검색기.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ko"><body>{children}</body></html>}
