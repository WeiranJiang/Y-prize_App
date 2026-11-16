import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/tokens';

export type IconName =
  | 'home' | 'explore' | 'trends' | 'profile' | 'case' | 'chevron' | 'chevronLeft' | 'close'
  | 'info' | 'strip' | 'check' | 'alert' | 'refresh' | 'search' | 'drop' | 'spark' | 'layers' | 'clock' | 'compare' | 'chat' | 'box' | 'pulse' | 'send' | 'zoom' | 'play' | 'pause';

export default function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.4 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <>
          <Path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" {...p} />
        </>
      )}
      {name === 'explore' && (
        <>
          <Circle cx="12" cy="12" r="8" {...p} />
          <Path d="M4 12c3 2.2 13 2.2 16 0M12 4c-2.6 3.5-2.6 12.5 0 16" {...p} />
        </>
      )}
      {name === 'trends' && <Path d="M4 17l4.5-5 3.5 3 7.5-8.5M15 6.5h4.5V11" {...p} />}
      {name === 'profile' && (
        <>
          <Circle cx="12" cy="8.5" r="3.5" {...p} />
          <Path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" {...p} />
        </>
      )}
      {name === 'case' && (
        <>
          <Rect x="3" y="8" width="18" height="10" rx="5" {...p} />
          <Path d="M3.5 12h17" {...p} />
        </>
      )}
      {name === 'chevron' && <Path d="M9.5 6l6 6-6 6" {...p} />}
      {name === 'chevronLeft' && <Path d="M14.5 6l-6 6 6 6" {...p} />}
      {name === 'close' && <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...p} />}
      {name === 'info' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...p} />
          <Path d="M12 11v5.5M12 7.8v.2" {...p} />
        </>
      )}
      {name === 'strip' && (
        <>
          <Path d="M4 15c4-6 12-6 16 0" {...p} />
          <Circle cx="7.5" cy="12.6" r="0.9" {...p} />
          <Circle cx="12" cy="10.6" r="0.9" {...p} />
          <Circle cx="16.5" cy="12.6" r="0.9" {...p} />
        </>
      )}
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />}
      {name === 'alert' && (
        <>
          <Path d="M12 4.5l8.5 15h-17z" {...p} />
          <Path d="M12 10v4.5M12 17v.2" {...p} />
        </>
      )}
      {name === 'refresh' && <Path d="M19 12a7 7 0 1 1-2.1-5M19 4.5V9h-4.5" {...p} />}
      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="6" {...p} />
          <Path d="M15.5 15.5 20 20" {...p} />
        </>
      )}
      {name === 'drop' && <Path d="M12 4c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0C6.5 11 9 8 12 4z" {...p} />}
      {name === 'spark' && <Path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" {...p} />}
      {name === 'layers' && <Path d="M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" {...p} />}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...p} />
          <Path d="M12 7.5V12l3 2" {...p} />
        </>
      )}
      {name === 'compare' && <Path d="M12 3.5v17M5 7h4v10H5zM15 7h4v10h-4z" {...p} />}
      {name === 'chat' && <Path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" {...p} />}
      {name === 'box' && <Path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9" {...p} />}
      {name === 'pulse' && <Path d="M3.5 12h4l2-5 4 10 2-5h5" {...p} />}
      {name === 'send' && <Path d="M4 12 20 4.5 15.5 20l-3-6.5zM12.5 13.5 20 4.5" {...p} />}
      {name === 'play' && <Path d="M8 5.5v13l10.5-6.5z" {...p} />}
      {name === 'pause' && <Path d="M8.5 5.5v13M15.5 5.5v13" {...p} />}
      {name === 'zoom' && (
        <>
          <Circle cx="10.5" cy="10.5" r="6" {...p} />
          <Path d="M15 15l5 5M10.5 8v5M8 10.5h5" {...p} />
        </>
      )}
    </Svg>
  );
}
