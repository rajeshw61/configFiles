import React from 'react';

interface ScoreDialProps {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  title?: string;
  subtitle?: string;
}

export const ScoreDial: React.FC<ScoreDialProps> = ({
  score,
  grade,
  title = 'Security Score',
  subtitle = 'OWASP Compliant',
}) => {
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let strokeColor = 'var(--accent-emerald)';
  if (score < 60) {
    strokeColor = 'var(--accent-rose)';
  } else if (score < 80) {
    strokeColor = 'var(--accent-amber)';
  }

  return (
    <div className="score-badge-card">
      <div className="dial-wrapper">
        <svg className="dial-svg" viewBox="0 0 52 52">
          <circle
            cx="26"
            cy="26"
            r={radius}
            className="dial-bg"
          />
          <circle
            cx="26"
            cy="26"
            r={radius}
            stroke={strokeColor}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="dial-progress"
            style={{ filter: `drop-shadow(0 0 6px ${strokeColor}80)` }}
          />
        </svg>
        <span className="dial-grade-text" style={{ color: strokeColor }}>
          {grade}
        </span>
      </div>

      <div className="score-meta-box">
        <span className="score-title-text">
          {title}
        </span>
        <span className="score-number-text">
          {score} / 100
        </span>
        <span className="score-subtitle-text" style={{ color: strokeColor }}>
          ● {subtitle}
        </span>
      </div>
    </div>
  );
};
