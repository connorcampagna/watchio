'use client';

import { motion } from 'framer-motion';

/**
 * Skeuomorphic mechanical push-button with press animation.
 */
export default function RetroButton({
    children,
    variant = 'default',  // 'default' | 'red'
    onClick,
    href,
    className = '',
    ...props
}) {
    const classes = `btn-mechanical ${variant === 'red' ? 'btn-red' : ''} ${className}`;

    const inner = (
        <motion.span
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
        >
            {children}
        </motion.span>
    );

    if (href) {
        return (
            <a href={href} className={classes} {...props}>
                {inner}
            </a>
        );
    }

    return (
        <button className={classes} onClick={onClick} {...props}>
            {inner}
        </button>
    );
}
