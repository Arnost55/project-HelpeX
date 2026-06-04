import type { ActionType } from "../utils/promptTemplates";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function QuickActionGrid(_props: {
  onSendPrompt: (actionType: ActionType, prompt: string) => void;
  loadingAction: ActionType | null;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="text-center">
        <h1
          style={{
            color: '#E0E0E0',
            fontSize: '60px',
            fontWeight: 700,
            fontFamily: 'Inter, -apple-system, Roboto, Helvetica, sans-serif',
            lineHeight: '72px',
            letterSpacing: '-1.8px',
            marginBottom: '24px',
          }}
        >
          {getGreeting()}, John
        </h1>
        <p
          style={{
            color: '#E0E0E0',
            fontSize: '40px',
            fontWeight: 400,
            fontFamily: 'Inter, -apple-system, Roboto, Helvetica, sans-serif',
            lineHeight: '62px',
            letterSpacing: '-1.2px',
            margin: 0,
          }}
        >
          Where should we start?<br />
          Perhaps somewhere here.
        </p>
      </div>
    </div>
  );
}
