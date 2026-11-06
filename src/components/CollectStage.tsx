import { useEffect, useRef } from "react";

type CollectStageProps = {
  variant: "participant" | "screen";
};

type FlowMote = {
  element: SVGCircleElement;
  track: SVGPathElement;
  length: number;
  offset: number;
  duration: number;
};

function listenToPreference(preference: MediaQueryList, listener: () => void) {
  if (typeof preference.addEventListener === "function") {
    preference.addEventListener("change", listener);
    return () => preference.removeEventListener("change", listener);
  }
  preference.addListener(listener);
  return () => preference.removeListener(listener);
}

export function CollectStage({ variant }: CollectStageProps) {
  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<SVGSVGElement>(null);
  const moteRefs = useRef<Array<SVGCircleElement | null>>([]);

  useEffect(() => {
    const container = root.current;
    const svg = scene.current;
    if (!container || !svg) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactPreference = window.matchMedia("(max-width: 600px)");
    let animationFrame = 0;
    let motes: FlowMote[] = [];

    const buildMotes = () => {
      motes = moteRefs.current.flatMap((element) => {
        if (!element || (compactPreference.matches && element.classList.contains("flow-mote--optional"))) return [];
        const trackId = element.dataset.track;
        const track = trackId ? svg.querySelector<SVGPathElement>(`[id="${trackId}"]`) : null;
        if (!track) return [];
        return [{
          element,
          track,
          length: track.getTotalLength(),
          offset: Number(element.dataset.offset),
          duration: Number(element.dataset.duration),
        }];
      });
    };

    const animateLight = (time: number) => {
      for (const { element, track, length, offset, duration } of motes) {
        const progress = (time / duration + offset) % 1;
        const point = track.getPointAtLength(progress * length);
        element.setAttribute("cx", point.x.toFixed(2));
        element.setAttribute("cy", point.y.toFixed(2));
        element.setAttribute("opacity", (0.24 + Math.sin(progress * Math.PI) * 0.76).toFixed(3));
      }
      animationFrame = window.requestAnimationFrame(animateLight);
    };

    const syncAnimation = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      const paused = document.hidden || motionPreference.matches;
      container.classList.toggle("motion-paused", paused);
      if (!paused) animationFrame = window.requestAnimationFrame(animateLight);
    };

    const syncCompactScene = () => {
      buildMotes();
      syncAnimation();
    };

    buildMotes();
    document.addEventListener("visibilitychange", syncAnimation);
    const removeMotionListener = listenToPreference(motionPreference, syncAnimation);
    const removeCompactListener = listenToPreference(compactPreference, syncCompactScene);
    syncAnimation();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", syncAnimation);
      removeMotionListener();
      removeCompactListener();
      motes = [];
    };
  }, []);

  const moteRef = (index: number) => (element: SVGCircleElement | null) => {
    moteRefs.current[index] = element;
  };

  if (variant === "participant") {
    return (
      <div ref={root} className="participant-stage stage-scene" aria-hidden="true">
        <svg ref={scene} data-light-scene="true" viewBox="0 0 900 700" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <defs>
            <radialGradient id="p-blue-aura">
              <stop stopColor="#17577A" stopOpacity=".34" />
              <stop offset=".52" stopColor="#0D3553" stopOpacity=".14" />
              <stop offset="1" stopColor="#071524" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="p-gold-aura">
              <stop stopColor="#FFF0B7" stopOpacity=".72" />
              <stop offset=".18" stopColor="#F6CC76" stopOpacity=".32" />
              <stop offset=".5" stopColor="#B9802F" stopOpacity=".09" />
              <stop offset="1" stopColor="#B9802F" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="p-core-light">
              <stop stopColor="#FFFCE7" />
              <stop offset=".2" stopColor="#FFF0B1" />
              <stop offset=".54" stopColor="#EAC16A" stopOpacity=".45" />
              <stop offset="1" stopColor="#D5A049" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="p-gold-metal" gradientUnits="userSpaceOnUse" x1="760" y1="10" x2="455" y2="560">
              <stop stopColor="#684019" />
              <stop offset=".17" stopColor="#D3A253" />
              <stop offset=".33" stopColor="#FFE8A4" />
              <stop offset=".45" stopColor="#9A6225" />
              <stop offset=".64" stopColor="#EBC477" />
              <stop offset=".82" stopColor="#FFF0B6" />
              <stop offset="1" stopColor="#B47B2E" />
            </linearGradient>
            <linearGradient id="p-gold-soft" gradientUnits="userSpaceOnUse" x1="630" y1="0" x2="450" y2="565">
              <stop stopColor="#342616" />
              <stop offset=".25" stopColor="#98713A" />
              <stop offset=".48" stopColor="#E3BC70" />
              <stop offset=".58" stopColor="#70502B" />
              <stop offset=".85" stopColor="#F9DB91" />
              <stop offset="1" stopColor="#D4A24D" />
            </linearGradient>
            <linearGradient id="p-gold-edge" gradientUnits="userSpaceOnUse" x1="770" y1="0" x2="450" y2="570">
              <stop stopColor="#C7994C" stopOpacity=".12" />
              <stop offset=".36" stopColor="#FFE8A4" stopOpacity=".88" />
              <stop offset=".74" stopColor="#FFF4C5" />
              <stop offset="1" stopColor="#FFF9DC" />
            </linearGradient>
            <linearGradient id="p-cyan-metal" gradientUnits="userSpaceOnUse" x1="860" y1="100" x2="460" y2="555">
              <stop stopColor="#082C43" />
              <stop offset=".25" stopColor="#11647B" />
              <stop offset=".48" stopColor="#51C2CC" />
              <stop offset=".59" stopColor="#1D879C" />
              <stop offset=".82" stopColor="#B1F0E8" />
              <stop offset="1" stopColor="#E8E6AE" />
            </linearGradient>
            <linearGradient id="p-floor-gold" gradientUnits="userSpaceOnUse" x1="20" y1="675" x2="460" y2="548">
              <stop stopColor="#49321B" stopOpacity=".03" />
              <stop offset=".36" stopColor="#AF803A" stopOpacity=".4" />
              <stop offset=".78" stopColor="#F3CC7E" />
              <stop offset="1" stopColor="#FFF0B5" />
            </linearGradient>
            <linearGradient id="p-floor-cyan" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="460" y2="548">
              <stop stopColor="#0C4058" stopOpacity=".03" />
              <stop offset=".35" stopColor="#167E91" stopOpacity=".5" />
              <stop offset=".82" stopColor="#79D8D6" />
              <stop offset="1" stopColor="#FFF0B5" />
            </linearGradient>
            <linearGradient id="p-floor-line" gradientUnits="userSpaceOnUse" x1="460" y1="548" x2="420" y2="700">
              <stop stopColor="#FFE3A0" stopOpacity=".7" />
              <stop offset=".35" stopColor="#AA8953" stopOpacity=".25" />
              <stop offset="1" stopColor="#395065" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="p-stage-top" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#FFEAB1" />
              <stop offset=".28" stopColor="#BD8C41" />
              <stop offset=".48" stopColor="#F7D68D" />
              <stop offset=".67" stopColor="#74512A" />
              <stop offset="1" stopColor="#241E18" />
            </linearGradient>
            <linearGradient id="p-stage-inner" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#14232A" />
              <stop offset=".5" stopColor="#17232A" />
              <stop offset="1" stopColor="#6F562F" />
            </linearGradient>
            <filter id="p-blur-28" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="28" />
            </filter>
            <filter id="p-blur-12" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="12" />
            </filter>
            <filter id="p-glow-5" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="5" result="p-blur" />
              <feMerge><feMergeNode in="p-blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="p-glow-2" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="2.5" result="p-soft" />
              <feMerge><feMergeNode in="p-soft" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <path id="p-track-gold" d="M742-30C660 140 696 300 576 420 522 476 482 522 460 548" />
            <path id="p-track-cyan" d="M850 86C748 174 764 302 652 414 578 486 504 524 460 548" />
            <path id="p-track-floor" d="M-30 646C210 626 372 582 460 548" />
          </defs>

          <ellipse cx="525" cy="250" rx="390" ry="355" fill="url(#p-blue-aura)" />
          <ellipse className="stage-blur" cx="460" cy="550" rx="210" ry="130" fill="url(#p-gold-aura)" opacity=".28" filter="url(#p-blur-28)" />
          <g opacity=".42" stroke="#52728A" strokeWidth=".65">
            <path d="M460 548 52 700" /><path d="M460 548 205 700" /><path d="M460 548 350 700" />
            <path d="M460 548 500 700" /><path d="M460 548 650 700" /><path d="M460 548 810 700" />
            <path d="M82 655Q464 570 828 648" /><path d="M28 692Q464 580 880 684" />
          </g>
          <g opacity=".34" stroke="url(#p-floor-line)" strokeWidth=".9">
            <path d="M460 548 120 700" /><path d="M460 548 280 700" /><path d="M460 548 420 700" />
            <path d="M460 548 580 700" /><path d="M460 548 745 700" />
          </g>
          <path d="M-60 675C165 650 348 592 460 548 354 610 172 680-60 735Z" fill="url(#p-floor-gold)" opacity=".48" />
          <path d="M-50 632C170 620 350 582 460 548 320 596 140 650-50 672Z" fill="url(#p-floor-cyan)" opacity=".68" />
          <path d="M-40 636C180 623 354 583 460 548" stroke="#A5E5DE" strokeOpacity=".34" strokeWidth="1" />
          <path d="M900 681C728 625 570 575 460 548 624 595 770 660 872 714Z" fill="url(#p-floor-cyan)" opacity=".25" />
          <g className="scene-ribbon-breathe">
            <path className="stage-blur" d="M742-50C660 128 696 300 576 420 522 476 482 522 460 548 498 490 548 440 598 370 688 238 660 88 790-42Z" fill="#D9A74F" opacity=".14" filter="url(#p-blur-12)" />
            <path className="stage-blur" d="M850 86C748 174 764 302 652 414 578 486 504 524 460 548 534 498 610 462 684 396 784 302 794 174 884 122Z" fill="#43C7D4" opacity=".1" filter="url(#p-blur-12)" />
          </g>
          <path d="M612-55C562 92 606 244 524 378 490 434 470 502 460 548 478 470 496 414 520 360 568 244 528 90 558-55Z" fill="url(#p-gold-soft)" opacity=".67" />
          <path d="M612-55C562 92 606 244 524 378 490 434 470 502 460 548" stroke="url(#p-gold-edge)" strokeWidth="1.1" opacity=".62" />
          <path d="M850 86C748 174 764 302 652 414 578 486 504 524 460 548 534 498 610 462 684 396 784 302 794 174 884 122Z" fill="url(#p-cyan-metal)" opacity=".82" />
          <path d="M850 86C748 174 764 302 652 414 578 486 504 524 460 548" stroke="#90E5E1" strokeOpacity=".45" strokeWidth="1.2" />
          <path d="M880 126C786 196 792 316 684 396 610 462 534 498 460 548" stroke="#07384E" strokeOpacity=".7" strokeWidth="1.5" />
          <path d="M742-50C660 128 696 300 576 420 522 476 482 522 460 548 498 490 548 440 598 370 688 238 660 88 790-42Z" fill="url(#p-gold-metal)" />
          <path className="stage-blur" d="M742-50C660 128 696 300 576 420 522 476 482 522 460 548" stroke="url(#p-gold-edge)" strokeWidth="2.2" filter="url(#p-glow-2)" />
          <path d="M790-42C660 88 688 238 598 370 548 440 498 490 460 548" stroke="#5E3C1C" strokeOpacity=".65" strokeWidth="1.4" />
          <g stroke="url(#p-gold-edge)" strokeWidth=".7" opacity=".44">
            <path d="M714-44C642 132 674 294 560 414 514 466 480 514 460 548" />
            <path d="M696-40C628 136 658 288 546 404 506 452 476 504 460 548" />
            <path d="M768-42C682 102 704 250 612 376 554 452 500 500 460 548" />
          </g>
          <path d="M872 318C738 348 682 464 460 548 638 510 770 456 890 386Z" fill="url(#p-gold-soft)" opacity=".78" />
          <path d="M872 318C738 348 682 464 460 548" stroke="url(#p-gold-edge)" strokeWidth="1.4" />
          <g strokeLinecap="round">
            <path d="M460 548 350 344" stroke="#D7B366" strokeOpacity=".13" />
            <path d="M460 548 430 282" stroke="#F6D88D" strokeOpacity=".16" />
            <path d="M460 548 548 326" stroke="#7CC9D0" strokeOpacity=".14" />
            <path d="M460 548 680 410" stroke="#F9D98D" strokeOpacity=".16" />
          </g>
          <g fill="#D7E6E8">
            <circle cx="330" cy="148" r="1" opacity=".4" /><circle cx="470" cy="100" r=".8" opacity=".36" />
            <circle cx="598" cy="178" r="1.1" opacity=".5" /><circle cx="730" cy="248" r=".9" opacity=".38" />
            <circle cx="628" cy="356" r=".8" opacity=".35" /><circle cx="310" cy="470" r=".9" opacity=".32" />
          </g>
          <g fill="#EAC77D">
            <circle cx="540" cy="132" r="1.2" opacity=".56" /><circle cx="760" cy="394" r="1.1" opacity=".5" />
            <circle cx="370" cy="572" r="1" opacity=".42" />
          </g>
          <g className="scene-star" transform="translate(450 242)" stroke="#F8E6B2" strokeLinecap="round">
            <path d="M0-10V10M-10 0H10" strokeWidth=".8" /><path d="m-4-4 8 8m0-8-8 8" strokeWidth=".5" opacity=".6" />
            <circle r="1.7" fill="#FFF6D8" stroke="none" />
          </g>
          <g className="scene-star scene-star--slow scene-star--optional" transform="translate(716 112)" stroke="#B8E5E4" strokeLinecap="round">
            <path d="M0-7V7M-7 0H7" strokeWidth=".7" /><circle r="1.3" fill="#E5FAF4" stroke="none" />
          </g>
          <g className="scene-star scene-star--late scene-star--optional" transform="translate(318 402)" stroke="#F9E7B6" strokeLinecap="round">
            <path d="M0-6V6M-6 0H6" strokeWidth=".65" /><circle r="1.2" fill="#FFF7DB" stroke="none" />
          </g>
          <g className="scene-glow-breathe">
            <ellipse className="stage-blur" cx="460" cy="552" rx="102" ry="42" fill="url(#p-core-light)" filter="url(#p-blur-12)" />
            <path className="stage-blur" d="M380 562Q460 518 540 562" stroke="#FFE8A3" strokeOpacity=".34" strokeWidth="7" filter="url(#p-blur-12)" />
          </g>
          <ellipse className="stage-blur" cx="460" cy="582" rx="138" ry="27" fill="#020912" opacity=".65" filter="url(#p-blur-12)" />
          <path d="M330 560V578C330 594 388 608 460 608S590 594 590 578V560Z" fill="#121b23" />
          <ellipse cx="460" cy="578" rx="130" ry="24" fill="#0d1821" stroke="#9F7B3D" strokeOpacity=".34" />
          <path d="M342 565V576C342 590 395 600 460 600S578 590 578 576V565Z" fill="url(#p-stage-top)" />
          <ellipse cx="460" cy="564" rx="118" ry="23" fill="url(#p-stage-top)" />
          <ellipse cx="460" cy="560" rx="108" ry="19" fill="url(#p-stage-inner)" stroke="#FFE7A3" strokeOpacity=".68" strokeWidth="1" />
          <ellipse cx="460" cy="560" rx="96" ry="14" stroke="#D6B066" strokeOpacity=".3" strokeWidth=".7" />
          <path d="M354 562C380 546 532 544 566 560" stroke="#FFF0BB" strokeOpacity=".55" strokeWidth=".9" />
          <ellipse cx="460" cy="550" rx="78" ry="20" fill="url(#p-core-light)" opacity=".8" />
          <ellipse className="stage-blur" cx="460" cy="547" rx="30" ry="9" fill="url(#p-core-light)" filter="url(#p-glow-5)" />
          <circle className="stage-blur" cx="460" cy="545" r="3.4" fill="#FFF9DE" filter="url(#p-glow-5)" />
          <g className="stage-blur" fill="#FFF0B8" filter="url(#p-glow-2)">
            <circle ref={moteRef(0)} className="flow-mote" data-track="p-track-gold" data-offset="0.08" data-duration="19000" cx="654" cy="242" r="2.2" />
            <circle ref={moteRef(1)} className="flow-mote flow-mote--optional" data-track="p-track-cyan" data-offset="0.52" data-duration="23000" cx="642" cy="426" r="2" />
            <circle ref={moteRef(2)} className="flow-mote" data-track="p-track-floor" data-offset="0.26" data-duration="21000" cx="280" cy="600" r="1.9" />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div ref={root} className="screen-stage stage-scene" aria-hidden="true">
      <svg ref={scene} data-light-scene="true" viewBox="0 0 1600 620" preserveAspectRatio="xMidYMax slice" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <radialGradient id="s-blue-aura">
            <stop stopColor="#17577A" stopOpacity=".3" /><stop offset=".55" stopColor="#0D3553" stopOpacity=".13" /><stop offset="1" stopColor="#071524" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="s-gold-aura">
            <stop stopColor="#FFF0B7" stopOpacity=".72" /><stop offset=".18" stopColor="#F6CC76" stopOpacity=".3" /><stop offset=".5" stopColor="#B9802F" stopOpacity=".08" /><stop offset="1" stopColor="#B9802F" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="s-core-light">
            <stop stopColor="#FFFCE7" /><stop offset=".2" stopColor="#FFF0B1" /><stop offset=".54" stopColor="#EAC16A" stopOpacity=".44" /><stop offset="1" stopColor="#D5A049" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="s-gold-metal" gradientUnits="userSpaceOnUse" x1="1350" y1="-30" x2="800" y2="520">
            <stop stopColor="#684019" /><stop offset=".16" stopColor="#D3A253" /><stop offset=".32" stopColor="#FFE8A4" /><stop offset=".44" stopColor="#9A6225" /><stop offset=".63" stopColor="#EBC477" /><stop offset=".82" stopColor="#FFF0B6" /><stop offset="1" stopColor="#B47B2E" />
          </linearGradient>
          <linearGradient id="s-gold-soft" gradientUnits="userSpaceOnUse" x1="260" y1="-30" x2="800" y2="520">
            <stop stopColor="#342616" /><stop offset=".25" stopColor="#98713A" /><stop offset=".47" stopColor="#E3BC70" /><stop offset=".58" stopColor="#70502B" /><stop offset=".84" stopColor="#F9DB91" /><stop offset="1" stopColor="#D4A24D" />
          </linearGradient>
          <linearGradient id="s-gold-edge" gradientUnits="userSpaceOnUse" x1="1300" y1="0" x2="800" y2="520">
            <stop stopColor="#C7994C" stopOpacity=".1" /><stop offset=".35" stopColor="#FFE8A4" stopOpacity=".88" /><stop offset=".73" stopColor="#FFF4C5" /><stop offset="1" stopColor="#FFF9DC" />
          </linearGradient>
          <linearGradient id="s-cyan-metal" gradientUnits="userSpaceOnUse" x1="1510" y1="90" x2="800" y2="520">
            <stop stopColor="#082C43" /><stop offset=".25" stopColor="#11647B" /><stop offset=".48" stopColor="#51C2CC" /><stop offset=".59" stopColor="#1D879C" /><stop offset=".82" stopColor="#B1F0E8" /><stop offset="1" stopColor="#E8E6AE" />
          </linearGradient>
          <linearGradient id="s-floor-gold" gradientUnits="userSpaceOnUse" x1="0" y1="610" x2="800" y2="500">
            <stop stopColor="#49321B" stopOpacity=".02" /><stop offset=".35" stopColor="#AF803A" stopOpacity=".34" /><stop offset=".77" stopColor="#F3CC7E" /><stop offset="1" stopColor="#FFF0B5" />
          </linearGradient>
          <linearGradient id="s-floor-cyan" gradientUnits="userSpaceOnUse" x1="1600" y1="610" x2="800" y2="500">
            <stop stopColor="#0C4058" stopOpacity=".02" /><stop offset=".35" stopColor="#167E91" stopOpacity=".42" /><stop offset=".82" stopColor="#79D8D6" /><stop offset="1" stopColor="#FFF0B5" />
          </linearGradient>
          <linearGradient id="s-floor-line" gradientUnits="userSpaceOnUse" x1="800" y1="500" x2="800" y2="620">
            <stop stopColor="#FFE3A0" stopOpacity=".64" /><stop offset=".35" stopColor="#AA8953" stopOpacity=".22" /><stop offset="1" stopColor="#395065" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="s-stage-top" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#FFEAB1" /><stop offset=".28" stopColor="#BD8C41" /><stop offset=".48" stopColor="#F7D68D" /><stop offset=".67" stopColor="#74512A" /><stop offset="1" stopColor="#241E18" />
          </linearGradient>
          <linearGradient id="s-stage-inner" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#14232A" /><stop offset=".5" stopColor="#17232A" /><stop offset="1" stopColor="#6F562F" />
          </linearGradient>
          <filter id="s-blur-32" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="32" /></filter>
          <filter id="s-blur-14" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="14" /></filter>
          <filter id="s-glow-6" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="6" result="s-blur" /><feMerge><feMergeNode in="s-blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="s-glow-3" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3" result="s-soft" /><feMerge><feMergeNode in="s-soft" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <path id="s-track-gold" d="M1332-70C1204 120 1218 298 1048 434 956 496 862 472 800 500" />
          <path id="s-track-cyan" d="M1528 82C1380 176 1380 318 1216 432 1074 512 914 466 800 500" />
          <path id="s-track-floor" d="M-40 598C320 578 610 536 800 500" />
        </defs>
        <ellipse cx="800" cy="242" rx="690" ry="400" fill="url(#s-blue-aura)" />
        <ellipse className="stage-blur" cx="800" cy="500" rx="265" ry="115" fill="url(#s-gold-aura)" opacity=".26" filter="url(#s-blur-32)" />
        <g opacity=".38" stroke="#52728A" strokeWidth=".65">
          <path d="M800 500 90 620" /><path d="M800 500 290 620" /><path d="M800 500 490 620" /><path d="M800 500 670 620" />
          <path d="M800 500 930 620" /><path d="M800 500 1110 620" /><path d="M800 500 1310 620" /><path d="M800 500 1510 620" />
          <path d="M100 582Q800 490 1500 582" /><path d="M35 616Q800 505 1565 616" />
        </g>
        <g opacity=".3" stroke="url(#s-floor-line)" strokeWidth=".85">
          <path d="M800 500 195 620" /><path d="M800 500 390 620" /><path d="M800 500 590 620" /><path d="M800 500 760 620" />
          <path d="M800 500 1010 620" /><path d="M800 500 1210 620" /><path d="M800 500 1405 620" />
        </g>
        <path d="M-80 604C300 586 610 536 800 500 590 554 280 616-80 672Z" fill="url(#s-floor-gold)" opacity=".48" />
        <path d="M1680 604C1300 586 990 536 800 500 1010 554 1320 616 1680 672Z" fill="url(#s-floor-cyan)" opacity=".48" />
        <path d="M-40 596C320 578 610 536 800 500" stroke="#D9C389" strokeOpacity=".28" strokeWidth="1" />
        <path d="M1640 596C1280 578 990 536 800 500" stroke="#A5E5DE" strokeOpacity=".32" strokeWidth="1" />
        <g className="scene-ribbon-breathe">
          <path className="stage-blur" d="M1320-100C1190 105 1210 300 1040 438 950 500 858 472 800 500 896 448 1000 400 1090 330 1234 220 1240 60 1380-50Z" fill="#D9A74F" opacity=".12" filter="url(#s-blur-14)" />
          <path className="stage-blur" d="M1530 70C1370 165 1380 320 1210 435 1070 515 910 465 800 500 936 456 1082 430 1230 340 1400 240 1415 145 1560 110Z" fill="#43C7D4" opacity=".09" filter="url(#s-blur-14)" />
        </g>
        <path d="M280-100C410 105 390 300 560 438 650 500 742 472 800 500 704 448 600 400 510 330 366 220 360 60 220-50Z" fill="url(#s-gold-soft)" opacity=".57" />
        <path d="M280-100C410 105 390 300 560 438 650 500 742 472 800 500" stroke="url(#s-gold-edge)" strokeWidth="1.25" opacity=".48" />
        <path d="M300-70C418 112 408 292 574 428 656 490 746 470 800 500" stroke="url(#s-gold-edge)" strokeWidth=".7" opacity=".3" />
        <path d="M1530 70C1370 165 1380 320 1210 435 1070 515 910 465 800 500 936 456 1082 430 1230 340 1400 240 1415 145 1560 110Z" fill="url(#s-cyan-metal)" opacity=".8" />
        <path d="M1530 70C1370 165 1380 320 1210 435 1070 515 910 465 800 500" stroke="#90E5E1" strokeOpacity=".42" strokeWidth="1.3" />
        <path d="M1560 110C1415 145 1400 240 1230 340 1082 430 936 456 800 500" stroke="#07384E" strokeOpacity=".65" strokeWidth="1.5" />
        <path d="M1320-100C1190 105 1210 300 1040 438 950 500 858 472 800 500 896 448 1000 400 1090 330 1234 220 1240 60 1380-50Z" fill="url(#s-gold-metal)" />
        <path className="stage-blur" d="M1320-100C1190 105 1210 300 1040 438 950 500 858 472 800 500" stroke="url(#s-gold-edge)" strokeWidth="2.4" filter="url(#s-glow-3)" />
        <path d="M1380-50C1240 60 1234 220 1090 330 1000 400 896 448 800 500" stroke="#5E3C1C" strokeOpacity=".62" strokeWidth="1.5" />
        <g stroke="url(#s-gold-edge)" strokeWidth=".75" opacity=".4">
          <path d="M1290-70C1174 116 1192 292 1028 426 944 488 858 470 800 500" />
          <path d="M1268-60C1158 122 1174 282 1012 416 936 476 852 466 800 500" />
          <path d="M1348-64C1222 92 1230 236 1074 354 970 432 874 468 800 500" />
        </g>
        <g strokeLinecap="round">
          <path d="M800 500 602 322" stroke="#D7B366" strokeOpacity=".11" /><path d="M800 500 742 248" stroke="#F6D88D" strokeOpacity=".14" />
          <path d="M800 500 884 286" stroke="#7CC9D0" strokeOpacity=".12" /><path d="M800 500 1050 360" stroke="#F9D98D" strokeOpacity=".14" />
        </g>
        <g fill="#D7E6E8">
          <circle cx="238" cy="170" r="1" opacity=".34" /><circle cx="430" cy="252" r=".9" opacity=".35" />
          <circle cx="560" cy="126" r="1.1" opacity=".4" /><circle cx="1040" cy="128" r=".9" opacity=".34" />
          <circle cx="1180" cy="250" r="1" opacity=".38" /><circle cx="1390" cy="166" r=".9" opacity=".32" />
          <circle cx="324" cy="430" r=".8" opacity=".28" /><circle cx="1270" cy="432" r=".9" opacity=".3" />
        </g>
        <g fill="#EAC77D">
          <circle cx="492" cy="336" r="1.1" opacity=".44" /><circle cx="1120" cy="356" r="1.1" opacity=".46" /><circle cx="800" cy="192" r="1.2" opacity=".4" />
        </g>
        <g className="scene-star scene-star--slow" transform="translate(800 376)" stroke="#F8E6B2" strokeLinecap="round">
          <path d="M0-13V13M-13 0H13" strokeWidth=".8" /><path d="m-5-5 10 10m0-10L-5 5" strokeWidth=".5" opacity=".55" /><circle r="2" fill="#FFF6D8" stroke="none" />
        </g>
        <g className="scene-star scene-star--optional" transform="translate(474 214)" stroke="#B8E5E4" strokeLinecap="round">
          <path d="M0-7V7M-7 0H7" strokeWidth=".65" /><circle r="1.3" fill="#E5FAF4" stroke="none" />
        </g>
        <g className="scene-star scene-star--late scene-star--optional" transform="translate(1130 202)" stroke="#F9E7B6" strokeLinecap="round">
          <path d="M0-7V7M-7 0H7" strokeWidth=".65" /><circle r="1.3" fill="#FFF7DB" stroke="none" />
        </g>
        <g className="scene-glow-breathe">
          <ellipse className="stage-blur" cx="800" cy="504" rx="148" ry="48" fill="url(#s-core-light)" filter="url(#s-blur-14)" />
          <path className="stage-blur" d="M680 516Q800 454 920 516" stroke="#FFE8A3" strokeOpacity=".3" strokeWidth="8" filter="url(#s-blur-14)" />
        </g>
        <ellipse className="stage-blur" cx="800" cy="548" rx="198" ry="31" fill="#020912" opacity=".64" filter="url(#s-blur-14)" />
        <path d="M610 510V532C610 552 695 570 800 570S990 552 990 532V510Z" fill="#111b24" />
        <ellipse cx="800" cy="532" rx="190" ry="34" fill="#0c1721" stroke="#9F7B3D" strokeOpacity=".32" />
        <path d="M624 514V528C624 545 703 558 800 558S976 545 976 528V514Z" fill="url(#s-stage-top)" />
        <ellipse cx="800" cy="512" rx="176" ry="30" fill="url(#s-stage-top)" />
        <ellipse cx="800" cy="508" rx="158" ry="25" fill="url(#s-stage-inner)" stroke="#FFE7A3" strokeOpacity=".66" strokeWidth="1.1" />
        <ellipse cx="800" cy="508" rx="140" ry="19" stroke="#D6B066" strokeOpacity=".28" strokeWidth=".8" />
        <path d="M644 510C684 486 914 484 956 508" stroke="#FFF0BB" strokeOpacity=".52" strokeWidth="1" />
        <ellipse cx="800" cy="497" rx="108" ry="26" fill="url(#s-core-light)" opacity=".8" />
        <ellipse className="stage-blur" cx="800" cy="493" rx="42" ry="11" fill="url(#s-core-light)" filter="url(#s-glow-6)" />
        <circle className="stage-blur" cx="800" cy="490" r="4" fill="#FFF9DE" filter="url(#s-glow-6)" />
        <g className="stage-blur" fill="#FFF0B8" filter="url(#s-glow-3)">
          <circle ref={moteRef(0)} className="flow-mote" data-track="s-track-gold" data-offset="0.08" data-duration="19000" cx="1150" cy="280" r="2.4" />
          <circle ref={moteRef(1)} className="flow-mote flow-mote--optional" data-track="s-track-cyan" data-offset="0.52" data-duration="23000" cx="1080" cy="450" r="2.2" />
          <circle ref={moteRef(2)} className="flow-mote" data-track="s-track-floor" data-offset="0.26" data-duration="21000" cx="480" cy="548" r="2" />
        </g>
      </svg>
    </div>
  );
}
