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
          className="font-bold leading-tight tracking-tight mb-6"
          style={{
            color: '#E0E0E0',
            fontSize: 'clamp(2rem, 5vw, 3.75rem)',
            letterSpacing: '-0.03em',
          }}
        >
          {getGreeting()}, Commander
        </h1>
        <p
          className="font-normal leading-relaxed"
          style={{
            color: '#E0E0E0',
            fontSize: 'clamp(1.25rem, 2.5vw, 2.5rem)',
            letterSpacing: '-0.03em',
          }}
        >
          Where should we start?
          <br />
          Perhaps somewhere here.
        </p>
      </div>
    </div>
  );
}
