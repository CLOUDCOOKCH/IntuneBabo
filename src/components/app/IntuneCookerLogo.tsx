import intuneCookerLogo from '../../assets/intunecooker-logo.svg';

type IntuneCookerLogoProps = {
  className?: string;
  showWordmark?: boolean;
  compact?: boolean;
};

export function IntuneCookerLogo({ className = '', showWordmark = true, compact = false }: IntuneCookerLogoProps) {
  return (
    <div className={`intunecooker-logo ${compact ? 'intunecooker-logo--compact' : ''} ${className}`.trim()}>
      <img
        alt="IntuneCooker logo"
        className="intunecooker-logo__mark"
        src={intuneCookerLogo}
      />
      {showWordmark ? (
        <div className="intunecooker-logo__wordmark">
          <span className="intunecooker-logo__name">IntuneCooker</span>
          <span className="intunecooker-logo__tag">Cloud configuration assessment</span>
        </div>
      ) : null}
    </div>
  );
}
