import type { ReactElement, ReactNode, SVGProps } from 'react';

export type MailIconName =
  | 'compose'
  | 'inbox'
  | 'enquiry'
  | 'booking'
  | 'quote'
  | 'estimate'
  | 'confirmation'
  | 'invoice'
  | 'payment'
  | 'membership'
  | 'warranty'
  | 'supplier'
  | 'team'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'trash'
  | 'spam'
  | 'star'
  | 'starFilled'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'delete'
  | 'markRead'
  | 'print'
  | 'attach'
  | 'search'
  | 'back'
  | 'envelope'
  | 'more'
  | 'user'
  | 'car'
  | 'booking'
  | 'quoteDoc'
  | 'whatsapp';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

const defaults = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Icon({ size = 20, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...defaults} {...props}>
      {children}
    </svg>
  );
}

export function MailIconCompose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function MailIconInbox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 12h-6l-2 3H10l-2-3H4" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Icon>
  );
}

export function MailIconEnquiry(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function MailIconBooking(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </Icon>
  );
}

export function MailIconQuote(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </Icon>
  );
}

export function MailIconEstimate(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </Icon>
  );
}

export function MailIconConfirmation(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </Icon>
  );
}

export function MailIconInvoice(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 2v20l4-2 4 2 4-2 4 2V2l-4 2-4-2-4 2z" />
      <path d="M8 10h8M8 14h5" />
    </Icon>
  );
}

export function MailIconPayment(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </Icon>
  );
}

export function MailIconMembership(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

export function MailIconWarranty(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

export function MailIconSupplier(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
      <path d="M3 9l2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" />
      <path d="M12 3v6" />
    </Icon>
  );
}

export function MailIconTeam(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

export function MailIconSent(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </Icon>
  );
}

export function MailIconDrafts(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

export function MailIconArchive(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </Icon>
  );
}

export function MailIconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

export function MailIconSpam(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  );
}

export function MailIconStar(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
    </Icon>
  );
}

export function MailIconStarFilled(props: IconProps) {
  return (
    <svg width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.5}
        d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"
      />
    </svg>
  );
}

export function MailIconReply(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 17H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6" />
      <path d="m9 17-5-5 5-5" />
    </Icon>
  );
}

export function MailIconReplyAll(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 7-3 3 3 3" />
      <path d="M6 10h11a4 4 0 0 1 0 8H9" />
      <path d="m9 17-5-5 5-5" />
    </Icon>
  );
}

export function MailIconForward(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 17 5-5-5-5" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    </Icon>
  );
}

export function MailIconDelete(props: IconProps) {
  return <MailIconTrash {...props} />;
}

export function MailIconMarkRead(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 11.08V12a10 10 0 0 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </Icon>
  );
}

export function MailIconPrint(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </Icon>
  );
}

export function MailIconAttach(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Icon>
  );
}

export function MailIconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

export function MailIconBack(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function MailIconEnvelope(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Icon>
  );
}

export function MailIconUser(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  );
}

export function MailIconCar(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </Icon>
  );
}

export function MailIconWhatsapp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Icon>
  );
}

function MailIconMore(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </Icon>
  );
}

const ICON_MAP: Record<MailIconName, (props: IconProps) => ReactElement> = {
  compose: MailIconCompose,
  inbox: MailIconInbox,
  enquiry: MailIconEnquiry,
  booking: MailIconBooking,
  quote: MailIconQuote,
  estimate: MailIconEstimate,
  confirmation: MailIconConfirmation,
  invoice: MailIconInvoice,
  payment: MailIconPayment,
  membership: MailIconMembership,
  warranty: MailIconWarranty,
  supplier: MailIconSupplier,
  team: MailIconTeam,
  sent: MailIconSent,
  drafts: MailIconDrafts,
  archive: MailIconArchive,
  trash: MailIconTrash,
  spam: MailIconSpam,
  star: MailIconStar,
  starFilled: MailIconStarFilled,
  reply: MailIconReply,
  replyAll: MailIconReplyAll,
  forward: MailIconForward,
  delete: MailIconDelete,
  markRead: MailIconMarkRead,
  print: MailIconPrint,
  attach: MailIconAttach,
  search: MailIconSearch,
  back: MailIconBack,
  envelope: MailIconEnvelope,
  more: MailIconMore,
  user: MailIconUser,
  car: MailIconCar,
  quoteDoc: MailIconQuote,
  whatsapp: MailIconWhatsapp,
};

export function MailIcon({ name, ...props }: IconProps & { name: MailIconName }) {
  const Cmp = ICON_MAP[name];
  return <Cmp {...props} />;
}
