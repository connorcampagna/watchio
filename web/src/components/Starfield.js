'use client';

import { useMemo } from 'react';

/**
 * Generates a random star field background.
 */
export default function Starfield({ count = 80 }) {
    const stars = useMemo(() => {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            size: `${1 + Math.random() * 2}px`,
            duration: `${2 + Math.random() * 4}s`,
            delay: `${Math.random() * 3}s`,
        }));
    }, [count]);

    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
            }}
        >
            {stars.map((s) => (
                <span
                    key={s.id}
                    className="star"
                    style={{
                        left: s.left,
                        top: s.top,
                        width: s.size,
                        height: s.size,
                        '--duration': s.duration,
                        '--delay': s.delay,
                    }}
                />
            ))}
        </div>
    );
}
