'use client';

import { motion } from 'framer-motion';

/**
 * Animated neon sign title with flickering effect.
 */
export default function NeonSign({ text = '', subtitle }) {
    return (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <motion.h1
                className="neon-text-red neon-flicker"
                style={{
                    fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
                    lineHeight: 1.1,
                    letterSpacing: '0.04em',
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
            >
                {text}
            </motion.h1>
            {subtitle && (
                <motion.p
                    className="neon-text-yellow"
                    style={{
                        fontSize: 'clamp(0.9rem, 2vw, 1.4rem)',
                        marginTop: '1rem',
                        fontFamily: 'var(--font-body)',
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                >
                    {subtitle}
                </motion.p>
            )}
        </div>
    );
}
