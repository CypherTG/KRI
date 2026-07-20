import React, { useEffect, useRef, useState } from 'react';
import { Typography } from '@mui/material';

interface Props {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  variant?: any;
  sx?: any;
  formatter?: (v: number) => string;
}

export default function AnimatedCounter({ target, duration = 1200, prefix = '', suffix = '', variant = 'h4', sx, formatter }: Props) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = Date.now();
    const startVal = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(startVal + (target - startVal) * eased);
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  const display = formatter ? formatter(value) : `${prefix}${value.toLocaleString()}${suffix}`;

  return (
    <Typography variant={variant} sx={sx}>
      {display}
    </Typography>
  );
}
