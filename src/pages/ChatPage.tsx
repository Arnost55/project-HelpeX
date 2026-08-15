import ChatPanel from "../components/ChatPanel";

interface ChatPageProps {
  onOpenSettings: () => void;
}

export default function ChatPage({ onOpenSettings }: ChatPageProps): JSX.Element {
  return <ChatPanel mode="full" onOpenSettings={onOpenSettings} />;
}
