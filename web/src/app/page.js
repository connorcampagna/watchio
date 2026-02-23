'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import NeonSign from '@/components/NeonSign';
import RetroButton from '@/components/RetroButton';
import Starfield from '@/components/Starfield';

const posters = [
  { title: 'The Breakfast Club', year: '1985', img: '/posters/breakfast-club.jpg' },
  { title: 'Back to the Future', year: '1985', img: '/posters/back-to-the-future.jpg' },
  { title: 'Ghostbusters', year: '1984', img: '/posters/ghostbusters.jpg' },
  { title: 'Blade Runner', year: '1982', img: '/posters/blade-runner.jpg' },
  { title: 'E.T.', year: '1982', img: '/posters/et.jpg' },
  { title: 'Top Gun', year: '1986', img: '/posters/top-gun.jpg' },
  { title: 'The Goonies', year: '1985', img: '/posters/the-goonies.jpg' },
  { title: 'Ferris Bueller', year: '1986', img: '/posters/ferris-bueller.jpg' },
  { title: 'Die Hard', year: '1988', img: '/posters/die-hard.jpg' },
  { title: 'Indiana Jones', year: '1981', img: '/posters/indiana-jones.jpg' },
  { title: 'The Terminator', year: '1984', img: '/posters/the-terminator.jpg' },
  { title: 'Aliens', year: '1986', img: '/posters/aliens.jpg' },
  { title: 'The Shining', year: '1980', img: '/posters/the-shining.jpg' },
  { title: 'Star Wars', year: '1977', img: '/posters/star-wars.jpg' },
  { title: 'Jaws', year: '1975', img: '/posters/jaws.jpg' },
  { title: 'Rocky', year: '1976', img: '/posters/rocky.jpg' },
  { title: 'Scarface', year: '1983', img: '/posters/scarface.jpg' },
  { title: 'Gremlins', year: '1984', img: '/posters/gremlins.jpg' },
];

const steps = [
  { num: '1', icon: '🎟️', label: 'Create a Room', detail: 'Pick a name. Get an invite code.' },
  { num: '2', icon: '🔗', label: 'Share the Code', detail: 'Send it to your friends.' },
  { num: '3', icon: '▶️', label: 'Choose A Video', detail: 'From Netflix To Youtube, The Choice is Yours.' },
];

/* ── film strip component ── */
function FilmStrip({ side }) {
  return (
    <div className={`film-strip film-strip--${side}`}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="film-sprocket" />
      ))}
    </div>
  );
}

export default function MarqueePage() {
  const [curtainOpen, setCurtainOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => setCurtainOpen(true), 600);
  }, []);

  return (
    <main className="home-page">
      <Starfield count={100} />

      <FilmStrip side="left" />
      <FilmStrip side="right" />

      {/* ━━━━━━  CURTAIN REVEAL  ━━━━━━ */}
      <div className={`curtain-wrapper ${curtainOpen ? 'curtain-open' : ''}`}>
        <div className="curtain curtain--left" />
        <div className="curtain curtain--right" />
      </div>

      {/* ━━━━━━  MARQUEE / HERO  ━━━━━━ */}
      <section className="hero">
        <div className="marquee-border" />

        <div className="spotlight spotlight--left" />
        <div className="spotlight spotlight--right" />

        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <NeonSign text="Watchio" />
        </motion.div>

        <motion.p
          className="tagline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          Watch movies with your friends — synced, together, from anywhere.
        </motion.p>

        <motion.div
          className="hero-ctas"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
        >
          <RetroButton variant="red" href="/room">
            Create a Room
          </RetroButton>
          <RetroButton href="/room?join=true">
            Join a Room
          </RetroButton>
        </motion.div>
      </section>

      {/* ━━━━━━  POSTER WALL  ━━━━━━ */}
      <section className="poster-wall">
        <div className="poster-wall-header">
          <div className="poster-wall-line" />
          <h2 className="poster-wall-title">Now Showing</h2>
          <div className="poster-wall-line" />
        </div>
        <div className="poster-grid">
          {posters.map((poster, i) => (
            <motion.div
              key={poster.title}
              className="poster-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ delay: (i % 6) * 0.06, duration: 0.4 }}
              whileHover={{ scale: 1.05, y: -6 }}
            >
              <div className="poster-art">
                <img src={poster.img} alt={poster.title} className="poster-img" loading="lazy" />
                <div className="poster-overlay">
                  <span className="poster-title-text">{poster.title}</span>
                  <span className="poster-year">{poster.year}</span>
                </div>
                <div className="poster-shine" />
              </div>
              <div className="poster-light" />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ━━━━━━  THE FOYER  ━━━━━━ */}
      <section className="foyer">
        <div className="foyer-inner">
          <motion.h2
            className="foyer-heading"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            The Foyer
          </motion.h2>
          <p className="foyer-sub">Welcome in. Here&apos;s how it works.</p>

          <div className="steps-row">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                className="step-card"
                initial={{ opacity: 0, y: 40, rotateX: -10 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: i * 0.15, duration: 0.5, type: 'spring' }}
                whileHover={{ y: -8, boxShadow: '0 12px 40px rgba(201,26,26,0.3)' }}
              >
                <span className="step-icon">{s.icon}</span>
                <span className="step-num">{s.num}</span>
                <h3 className="step-label">{s.label}</h3>
                <p className="step-detail">{s.detail}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="concession"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="concession-title">🍿 Concession Stand</h3>
            <div className="concession-items">
              <div className="concession-item">
                <span className="concession-icon">💬</span>
                <div>
                  <strong>Live Chat</strong>
                  <p>Talk while you watch in the chat.</p>
                </div>
              </div>
              <div className="concession-item">
                <span className="concession-icon">👑</span>
                <div>
                  <strong>Host Controls</strong>
                  <p>Only Host Can Control Video.</p>
                </div>
              </div>
              <div className="concession-item">
                <span className="concession-icon">🔗</span>
                <div>
                  <strong>Invite Codes</strong>
                  <p>Share a short code. No accounts needed.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━  FOOTER  ━━━━━━ */}
      <footer className="home-footer">
        <div className="footer-strip" />
        <p>Connor Campagna &copy; {new Date().getFullYear()}</p>
      </footer>
    </main>
  );
}

