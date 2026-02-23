'use client';

import { motion } from 'framer-motion';

/**
 * Stylised movie screen shape – used as a decorative hero element.
 */
export default function MovieScreen() {
    return (
        <motion.div
            style={{
                width: '100%',
                maxWidth: '600px',
                aspectRatio: '16 / 9',
                margin: '0 auto',
                background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                border: '3px solid var(--color-chrome-dark)',
                borderRadius: '8px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow:
                    '0 0 40px rgba(201,26,26,0.15), inset 0 0 80px rgba(0,0,0,0.6)',
            }}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
        >
            {/* Projector light cone */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                        'radial-gradient(ellipse at 50% 40%, rgba(255,225,77,0.08) 0%, transparent 70%)',
                }}
            />
            {/* Film grain */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.04,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />
            {/* "Now Playing" text */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                }}
            >
                <span
                    className="neon-text-yellow"
                    style={{
                        fontSize: 'clamp(0.6rem, 2vw, 0.85rem)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                    }}
                >
                    Now Showing
                </span>
                <span
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'clamp(1rem, 3vw, 1.6rem)',
                        color: 'var(--color-cream)',
                        opacity: 0.7,
                    }}
                >
                    Your Next Movie Night
                </span>
            </div>
        </motion.div>
    );
}
