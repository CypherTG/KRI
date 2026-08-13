import * as React from 'react';
import airosLogo from '../../assets/AIROS_Logo.png';

export interface IKairosLauncherProps {
  onOpen: () => void;
  title?: string;
  description?: string;
  buttonLabel?: string;
}

export const KairosLauncher: React.FC<IKairosLauncherProps> = ({
  onOpen,
  title = 'KAIROS',
  description = 'Client Relationship Indicators & Key Network Management',
  buttonLabel = 'Launch KAIROS',
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [btnHovered, setBtnHovered] = React.useState(false);

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onOpen();
  };

  return (
    <section
      aria-label="KAIROS App Launcher"
      style={{
        fontFamily: "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: 'transparent',
        padding: 0,
        margin: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          alignItems: 'start',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={`Open ${title}`}
          onClick={onOpen}
          onKeyDown={handleCardKeyDown}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            background: '#ffffff',
            border: `1px solid ${isHovered ? '#c8c8c8' : '#e1e1e1'}`,
            borderRadius: '6px',
            minHeight: '190px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px 16px 16px',
            boxSizing: 'border-box',
            textAlign: 'center',
            cursor: 'pointer',
            transform: isHovered ? 'translateY(-4px)' : 'none',
            boxShadow: isHovered
              ? '0 8px 20px rgba(0, 0, 0, 0.12)'
              : '0 1px 4px rgba(0, 0, 0, 0.06)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
            position: 'relative',
            outline: 'none',
          }}
        >
          {/* Logo */}
          <div
            aria-hidden="true"
            style={{
              width: '60px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginBottom: '12px',
              overflow: 'hidden',
            }}
          >
            <img
              src={airosLogo}
              alt={title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* Title */}
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1a1a1a',
              margin: '0 0 8px 0',
              lineHeight: 1.3,
              flex: '1 1 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {title}
          </h2>

          {/* Description */}
          {description && (
            <p
              style={{
                fontSize: '13px',
                fontWeight: 400,
                color: '#616161',
                margin: '0 0 12px 0',
                lineHeight: 1.4,
                flex: '1 1 auto',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
              }}
            >
              {description}
            </p>
          )}

          {/* Action Button */}
          <button
            type="button"
            aria-label={`${buttonLabel} ${title}`}
            onClick={handleButtonClick}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '8px 12px',
              background: btnHovered ? '#5243DF' : '#6757EF',
              color: '#ffffff',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              flexShrink: 0,
              minHeight: '36px',
              letterSpacing: '0.1px',
              outline: 'none',
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </section>
  );
};

export default KairosLauncher;
