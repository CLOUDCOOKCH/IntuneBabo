import intuneBaboLogo from '../../assets/intunebabo-logo-256.png';

type IntuneBaboLogoProps = {
  className?: string;
  showWordmark?: boolean;
  compact?: boolean;
};

export function IntuneBaboLogo({ className = '', showWordmark = true, compact = false }: IntuneBaboLogoProps) {
  return (
    <div className={`intunebabo-logo ${compact ? 'intunebabo-logo--compact' : ''} ${className}`.trim()}>
      <img
        alt="IntuneBabo logo"
        className="intunebabo-logo__mark"
        src={intuneBaboLogo}
      />
      {showWordmark ? (
        <div className="intunebabo-logo__wordmark">
          <span className="intunebabo-logo__name">IntuneBabo</span>
          <span className="intunebabo-logo__tag">Intune configuration assessment</span>
        </div>
      ) : null}
    </div>
  );
}
