import './styles.css';import type {ReactNode} from 'react';
export const metadata={title:'FinOps Enterprise',description:'Corporate financial operations portal'};
export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>}
