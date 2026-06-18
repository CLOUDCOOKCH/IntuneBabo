import { Badge } from '../ui/badge';
import type { AppNotice } from '../../types/tenantdiff';

export function NotificationBanner({ notice }: { notice: AppNotice | null }) {
  if (!notice) return null;

  const variant =
    notice.tone === 'error' ? 'destructive' : notice.tone === 'warning' ? 'warning' : notice.tone === 'success' ? 'success' : 'secondary';

  return (
    <div className="rounded-lg border p-3 text-sm font-medium">
      <Badge variant={variant}>{notice.tone}</Badge> <span>{notice.message}</span>
    </div>
  );
}
