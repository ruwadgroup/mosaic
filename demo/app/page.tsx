import { Home } from '@/components/home';
import { loadShowcases } from '@/lib/showcases';

export default function Page() {
  return <Home showcases={loadShowcases()} />;
}
