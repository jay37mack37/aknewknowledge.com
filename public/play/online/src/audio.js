// Synthesized WebAudio sound effects (no external audio files needed)

export function createAudioController() {
  let ctx = null;
  let isMuted = false;
  let sirenOsc = null;
  let sirenGain = null;
  let isSirenRunning = false;

  function getContext() {
    if (!ctx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.15, freqEnd = null) {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;

    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (freqEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), ac.currentTime + duration);
      }

      gain.gain.setValueAtTime(gainVal, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start();
      osc.stop(ac.currentTime + duration);
    } catch (e) {}
  }

  let wakaToggle = false;
  function playWaka() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      wakaToggle = !wakaToggle;
      const osc = ac.createOscillator();
      const filter = ac.createBiquadFilter();
      const gain = ac.createGain();

      const startFreq = wakaToggle ? 380 : 500;
      const endFreq = wakaToggle ? 190 : 270;
      const duration = 0.085;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(startFreq, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), ac.currentTime + duration);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, ac.currentTime);
      filter.Q.setValueAtTime(2.5, ac.currentTime);

      gain.gain.setValueAtTime(0.24, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);

      osc.start();
      osc.stop(ac.currentTime + duration);
    } catch (e) {}
  }

  function playPowerPellet() {
    playTone(200, 'sawtooth', 0.25, 0.2, 700);
  }

  function playEatGhost() {
    const ac = getContext();
    if (!ac || isMuted) return;
    const notes = [400, 600, 800, 1200];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playTone(freq, 'square', 0.08, 0.15);
      }, idx * 60);
    });
  }

  function playDie() {
    const ac = getContext();
    if (!ac || isMuted) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, ac.currentTime);
      osc.frequency.linearRampToValueAtTime(80, ac.currentTime + 1.2);

      gain.gain.setValueAtTime(0.2, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ac.currentTime + 1.2);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start();
      osc.stop(ac.currentTime + 1.2);
    } catch (e) {}
  }

  function playFruit() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 'sine', 0.12, 0.18), i * 70);
    });
  }

  function playClear() {
    const notes = [440, 554, 659, 880, 1108];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 'triangle', 0.2, 0.2), i * 90);
    });
  }

  function playEmote() {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;
    try {
      playTone(587.33, 'sine', 0.14, 0.2, 880);
    } catch (e) {}
  }

  // Stereo panned proximity alert for ghosts near player
  function updateProximitySound(nearestGhostDist, relativeAngle) {
    if (isMuted) return;
    const ac = getContext();
    if (!ac) return;

    // If ghost is within 6 tiles, play periodic warning blip panned to relative angle
    if (nearestGhostDist < 6.0 && nearestGhostDist > 0.5) {
      try {
        const pan = Math.sin(relativeAngle); // -1 (left) to +1 (right)
        const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
        if (panner) {
          panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ac.currentTime);
        }

        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const intensity = 1.0 - (nearestGhostDist / 6.0);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140 + intensity * 120, ac.currentTime);

        gain.gain.setValueAtTime(0.08 * intensity, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);

        if (panner) {
          osc.connect(gain);
          gain.connect(panner);
          panner.connect(ac.destination);
        } else {
          osc.connect(gain);
          gain.connect(ac.destination);
        }

        osc.start();
        osc.stop(ac.currentTime + 0.1);
      } catch (e) {}
    }
  }

  return {
    init: () => getContext(),
    playWaka,
    playPowerPellet,
    playEatGhost,
    playDie,
    playFruit,
    playClear,
    playEmote,
    updateProximitySound,
    toggleMute: () => {
      isMuted = !isMuted;
      return isMuted;
    }
  };
}
