import { useEffect, useRef } from "react";

export function HomeStage() {
  const sceneRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motes = Array.from(scene.querySelectorAll<SVGCircleElement>(".flow-mote"), (element) => {
      const track = scene.querySelector<SVGPathElement>(`#${element.dataset.track}`);
      if (!track) throw new Error("Missing stage light track");
      return {
        element,
        track,
        length: track.getTotalLength(),
        offset: Number(element.dataset.offset),
        duration: Number(element.dataset.duration),
      };
    });
    let animationFrame = 0;
    const animateLight = (time: number) => {
      for (const { element, track, length, offset, duration } of motes) {
        const progress = (time / duration + offset) % 1;
        const point = track.getPointAtLength(progress * length);
        element.setAttribute("cx", point.x.toFixed(2));
        element.setAttribute("cy", point.y.toFixed(2));
        element.setAttribute("opacity", (0.25 + Math.sin(progress * Math.PI) * 0.75).toFixed(3));
      }
      animationFrame = requestAnimationFrame(animateLight);
    };
    const syncAnimation = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      if (!document.hidden && !motionPreference.matches) animationFrame = requestAnimationFrame(animateLight);
    };
    document.addEventListener("visibilitychange", syncAnimation);
    if (typeof motionPreference.addEventListener === "function") motionPreference.addEventListener("change", syncAnimation);
    else motionPreference.addListener(syncAnimation);
    syncAnimation();
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", syncAnimation);
      if (typeof motionPreference.removeEventListener === "function") motionPreference.removeEventListener("change", syncAnimation);
      else motionPreference.removeListener(syncAnimation);
    };
  }, []);

  return <div className="hero__visual" aria-hidden="true">
            <svg ref={sceneRef} className="hero__scene" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="blue-aura">
                  <stop stopColor="#17577A" stopOpacity=".34"/>
                  <stop offset=".52" stopColor="#0D3553" stopOpacity=".15"/>
                  <stop offset="1" stopColor="#071524" stopOpacity="0"/>
                </radialGradient>
                <radialGradient id="gold-aura">
                  <stop stopColor="#FFF0B7" stopOpacity=".85"/>
                  <stop offset=".16" stopColor="#F6CC76" stopOpacity=".42"/>
                  <stop offset=".48" stopColor="#B9802F" stopOpacity=".12"/>
                  <stop offset="1" stopColor="#B9802F" stopOpacity="0"/>
                </radialGradient>
                <radialGradient id="core-light">
                  <stop stopColor="#FFFCE7"/>
                  <stop offset=".18" stopColor="#FFF0B1"/>
                  <stop offset=".52" stopColor="#EAC16A" stopOpacity=".48"/>
                  <stop offset="1" stopColor="#D5A049" stopOpacity="0"/>
                </radialGradient>
                <linearGradient id="gold-metal" gradientUnits="userSpaceOnUse" x1="1120" y1="40" x2="790" y2="635">
                  <stop stopColor="#684019"/>
                  <stop offset=".16" stopColor="#D3A253"/>
                  <stop offset=".32" stopColor="#FFE8A4"/>
                  <stop offset=".43" stopColor="#9A6225"/>
                  <stop offset=".62" stopColor="#EBC477"/>
                  <stop offset=".8" stopColor="#FFF0B6"/>
                  <stop offset="1" stopColor="#B47B2E"/>
                </linearGradient>
                <linearGradient id="gold-metal-soft" gradientUnits="userSpaceOnUse" x1="1050" y1="0" x2="760" y2="665">
                  <stop stopColor="#342616"/>
                  <stop offset=".25" stopColor="#98713A"/>
                  <stop offset=".47" stopColor="#E3BC70"/>
                  <stop offset=".56" stopColor="#70502B"/>
                  <stop offset=".83" stopColor="#F9DB91"/>
                  <stop offset="1" stopColor="#D4A24D"/>
                </linearGradient>
                <linearGradient id="gold-edge" gradientUnits="userSpaceOnUse" x1="1110" y1="0" x2="760" y2="675">
                  <stop stopColor="#C7994C" stopOpacity=".1"/>
                  <stop offset=".35" stopColor="#FFE8A4" stopOpacity=".9"/>
                  <stop offset=".72" stopColor="#FFF4C5"/>
                  <stop offset="1" stopColor="#FFF9DC"/>
                </linearGradient>
                <linearGradient id="cyan-metal" gradientUnits="userSpaceOnUse" x1="1150" y1="190" x2="790" y2="650">
                  <stop stopColor="#082C43"/>
                  <stop offset=".25" stopColor="#11647B"/>
                  <stop offset=".48" stopColor="#51C2CC"/>
                  <stop offset=".58" stopColor="#1D879C"/>
                  <stop offset=".8" stopColor="#B1F0E8"/>
                  <stop offset="1" stopColor="#E8E6AE"/>
                </linearGradient>
                <linearGradient id="floor-gold" gradientUnits="userSpaceOnUse" x1="70" y1="850" x2="780" y2="650">
                  <stop stopColor="#49321B" stopOpacity=".05"/>
                  <stop offset=".34" stopColor="#AF803A" stopOpacity=".5"/>
                  <stop offset=".75" stopColor="#F3CC7E"/>
                  <stop offset="1" stopColor="#FFF0B5"/>
                </linearGradient>
                <linearGradient id="floor-cyan" gradientUnits="userSpaceOnUse" x1="0" y1="800" x2="780" y2="650">
                  <stop stopColor="#0C4058" stopOpacity=".05"/>
                  <stop offset=".35" stopColor="#167E91" stopOpacity=".65"/>
                  <stop offset=".8" stopColor="#79D8D6"/>
                  <stop offset="1" stopColor="#FFF0B5"/>
                </linearGradient>
                <linearGradient id="floor-line" gradientUnits="userSpaceOnUse" x1="750" y1="665" x2="650" y2="900">
                  <stop stopColor="#FFE3A0" stopOpacity=".85"/>
                  <stop offset=".3" stopColor="#AA8953" stopOpacity=".35"/>
                  <stop offset="1" stopColor="#395065" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="stage-top" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#FFEAB1"/>
                  <stop offset=".28" stopColor="#BD8C41"/>
                  <stop offset=".48" stopColor="#F7D68D"/>
                  <stop offset=".65" stopColor="#74512A"/>
                  <stop offset="1" stopColor="#241E18"/>
                </linearGradient>
                <linearGradient id="stage-inner" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#14232A"/>
                  <stop offset=".48" stopColor="#17232A"/>
                  <stop offset="1" stopColor="#6F562F"/>
                </linearGradient>
                <linearGradient id="card-gold" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#FFE8AC" stopOpacity=".82"/>
                  <stop offset=".28" stopColor="#D2A55D" stopOpacity=".32"/>
                  <stop offset=".64" stopColor="#254251" stopOpacity=".32"/>
                  <stop offset="1" stopColor="#C7994E" stopOpacity=".6"/>
                </linearGradient>
                <linearGradient id="card-shine" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#FFF6D3" stopOpacity=".85"/>
                  <stop offset=".5" stopColor="#FFF6D3" stopOpacity="0"/>
                  <stop offset="1" stopColor="#E6BE72" stopOpacity=".45"/>
                </linearGradient>
                <filter id="blur-40" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="40"/>
                </filter>
                <filter id="blur-16" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="16"/>
                </filter>
                <filter id="glow-7" x="-150%" y="-150%" width="400%" height="400%">
                  <feGaussianBlur stdDeviation="7" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="glow-3" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation="3" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="card-shadow" x="-60%" y="-50%" width="220%" height="230%">
                  <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#000814" floodOpacity=".55"/>
                </filter>
                <path id="track-gold" d="M1132-35C1034 151 1034 345 906 504 844 577 792 627 754 664"/>
                <path id="track-cyan" d="M1208 122C1088 223 1080 385 966 510 889 592 811 635 754 664"/>
                <path id="track-floor" d="M-40 806C280 770 549 711 754 664"/>
              </defs>

              <ellipse cx="875" cy="238" rx="430" ry="410" fill="url(#blue-aura)"/>
              <ellipse cx="755" cy="668" rx="260" ry="175" fill="url(#gold-aura)" opacity=".3" filter="url(#blur-40)"/>

              <g opacity=".52" stroke="#52728A" strokeWidth=".65">
                <path d="M754 664 71 897"/>
                <path d="M754 664 260 900"/>
                <path d="M754 664 427 900"/>
                <path d="M754 664 567 900"/>
                <path d="M754 664 698 900"/>
                <path d="M754 664 824 900"/>
                <path d="M754 664 964 900"/>
                <path d="M754 664 1120 900"/>
                <path d="M147 824Q716 703 1160 814"/>
                <path d="M73 872Q716 720 1200 862"/>
                <path d="M306 780Q741 697 1100 770"/>
              </g>

              <g opacity=".38" stroke="url(#floor-line)" strokeWidth="1">
                <path d="M754 664 120 900"/>
                <path d="M754 664 195 900"/>
                <path d="M754 664 350 900"/>
                <path d="M754 664 475 900"/>
                <path d="M754 664 610 900"/>
                <path d="M754 664 720 900"/>
                <path d="M754 664 846 900"/>
                <path d="M754 664 1000 900"/>
                <path d="M754 664 1150 900"/>
              </g>

              <path d="M-90 834C226 794 534 720 754 664 568 755 290 863-60 963Z" fill="url(#floor-gold)" opacity=".55"/>
              <path d="M-80 774C261 757 531 708 754 664 528 736 252 808-70 841Z" fill="url(#floor-cyan)" opacity=".78"/>
              <path d="M-70 783C261 762 539 710 754 664" stroke="#A5E5DE" strokeOpacity=".45" strokeWidth="1.2"/>
              <path d="M1215 914C1030 814 869 722 754 664 910 759 1051 879 1122 960Z" fill="url(#floor-cyan)" opacity=".32"/>
              <path d="M1190 899C1015 805 865 718 754 664" stroke="url(#floor-line)" strokeWidth="1.5"/>

              <g className="scene-ribbon-breathe">
                <path d="M1110-80C1015 130 1020 342 888 504 827 576 778 628 754 664 806 602 878 544 941 456 1080 264 1055 89 1200-45Z" fill="#D9A74F" opacity=".17" filter="url(#blur-16)"/>
                <path d="M1208 122C1088 223 1080 385 966 510 889 592 811 635 754 664 838 591 921 543 995 463 1115 335 1132 211 1208 122Z" fill="#43C7D4" opacity=".12" filter="url(#blur-16)"/>
              </g>

              <path d="M1018-70C945 130 1015 320 890 472 830 545 782 610 754 664 778 590 815 513 864 450 962 322 898 140 956-70Z" fill="url(#gold-metal-soft)" opacity=".78"/>
              <path d="M1018-70C945 130 1015 320 890 472 830 545 782 610 754 664" stroke="url(#gold-edge)" strokeWidth="1.7" opacity=".8"/>

              <path d="M1198 88C1080 198 1070 367 958 496 884 580 805 628 754 664 830 606 925 573 1008 491 1135 368 1138 224 1240 146Z" fill="url(#cyan-metal)" opacity=".9"/>
              <path d="M1198 88C1080 198 1070 367 958 496 884 580 805 628 754 664" stroke="#90E5E1" strokeOpacity=".55" strokeWidth="1.5"/>
              <path d="M1236 144C1136 224 1131 368 1008 491 925 573 830 606 754 664" stroke="#07384E" strokeOpacity=".8" strokeWidth="2"/>

              <path d="M1110-80C1015 130 1020 342 888 504 827 576 778 628 754 664 806 602 878 544 941 456 1080 264 1055 89 1200-45Z" fill="url(#gold-metal)"/>
              <path d="M1110-80C1015 130 1020 342 888 504 827 576 778 628 754 664" stroke="url(#gold-edge)" strokeWidth="3.1" filter="url(#glow-3)"/>
              <path d="M1200-45C1055 89 1080 264 941 456 878 544 806 602 754 664" stroke="#5E3C1C" strokeOpacity=".75" strokeWidth="2"/>

              <g stroke="url(#gold-edge)" strokeWidth=".8" opacity=".52">
                <path d="M1080-60C990 138 1001 336 876 492 821 559 779 618 754 664"/>
                <path d="M1066-60C976 140 988 330 864 480 815 540 776 608 754 664"/>
                <path d="M1052-60C963 143 975 322 853 469 808 524 772 598 754 664"/>
                <path d="M1038-60C950 147 962 316 842 458 801 509 768 588 754 664"/>
                <path d="M1168-50C1038 106 1057 273 926 456 867 539 802 601 754 664"/>
              </g>

              <path d="M1230 372C1078 419 1037 576 754 664 930 638 1094 570 1230 470Z" fill="url(#gold-metal-soft)" opacity=".94"/>
              <path d="M1230 372C1078 419 1037 576 754 664" stroke="url(#gold-edge)" strokeWidth="2.2"/>
              <path d="M1230 386C1088 433 1040 580 754 664" stroke="#F2D18A" strokeOpacity=".35" strokeWidth=".8"/>

              <g strokeLinecap="round">
                <path d="M754 664 596 430" stroke="#D7B366" strokeOpacity=".16"/>
                <path d="M754 664 648 346" stroke="#F6D88D" strokeOpacity=".22"/>
                <path d="M754 664 738 280" stroke="#F6D88D" strokeOpacity=".13"/>
                <path d="M754 664 828 366" stroke="#7CC9D0" strokeOpacity=".17"/>
                <path d="M754 664 1000 486" stroke="#F9D98D" strokeOpacity=".22"/>
                <path d="M754 664 1075 613" stroke="#F9D98D" strokeOpacity=".16"/>
              </g>

              <g transform="translate(908 215) rotate(10)" filter="url(#card-shadow)">
                <g className="scene-card-float">
                  <rect x="-68" y="-91" width="136" height="182" rx="5" fill="url(#card-gold)" stroke="url(#card-shine)" strokeWidth="1.4"/>
                  <rect x="-59" y="-82" width="118" height="164" rx="2" stroke="#F6D998" strokeOpacity=".27" strokeWidth=".7"/>
                  <path d="M-68-91H22L-68 23Z" fill="#FFF3C7" opacity=".08"/>
                  <path d="M68 91H15L68 24Z" fill="#E9BB6A" opacity=".09"/>
                  <circle cy="-10" r="35" stroke="#F9DE9E" strokeOpacity=".25" strokeWidth=".7"/>
                  <circle cy="-10" r="27" stroke="#F9DE9E" strokeOpacity=".12" strokeWidth=".7"/>
                  <path d="M0-43 6.4-16.4 33-10 6.4-3.6 0 23-6.4-3.6-33-10-6.4-16.4Z" fill="url(#gold-metal)" opacity=".92"/>
                  <path d="M0-31 3.4-13.4 21-10 3.4-6.6 0 11-3.4-6.6-21-10-3.4-13.4Z" fill="#FFF0B8" opacity=".7"/>
                  <path d="M-25 49H25" stroke="#F2D28C" strokeOpacity=".45" strokeWidth="1"/>
                  <path d="M-13 59H13" stroke="#F2D28C" strokeOpacity=".22" strokeWidth="1"/>
                </g>
              </g>

              <g transform="translate(1050 392) rotate(45)" opacity=".48">
                <rect x="-14" y="-14" width="28" height="28" fill="#6DBAC4" fillOpacity=".05" stroke="#A7E1DF" strokeWidth=".8"/>
                <rect x="-8" y="-8" width="16" height="16" stroke="#D6D6A4" strokeOpacity=".5" strokeWidth=".7"/>
              </g>

              <g fill="#D7E6E8">
                <circle cx="579" cy="170" r="1.1" opacity=".5"/>
                <circle cx="664" cy="101" r=".8" opacity=".42"/>
                <circle cx="735" cy="216" r="1.2" opacity=".65"/>
                <circle cx="806" cy="74" r=".8" opacity=".4"/>
                <circle cx="856" cy="133" r="1.1" opacity=".55"/>
                <circle cx="957" cy="63" r="1" opacity=".48"/>
                <circle cx="1092" cy="263" r="1.1" opacity=".56"/>
                <circle cx="1143" cy="330" r=".8" opacity=".4"/>
                <circle cx="1034" cy="534" r="1" opacity=".44"/>
                <circle cx="926" cy="455" r="1.1" opacity=".52"/>
                <circle cx="670" cy="367" r=".8" opacity=".4"/>
                <circle cx="622" cy="472" r="1.2" opacity=".52"/>
                <circle cx="585" cy="563" r=".8" opacity=".4"/>
                <circle cx="691" cy="583" r="1.1" opacity=".45"/>
                <circle cx="875" cy="588" r=".8" opacity=".55"/>
                <circle cx="1130" cy="639" r="1.1" opacity=".5"/>
                <circle cx="1072" cy="730" r=".8" opacity=".34"/>
                <circle cx="522" cy="699" r="1" opacity=".45"/>
                <circle cx="416" cy="757" r=".8" opacity=".35"/>
                <circle cx="341" cy="815" r="1.1" opacity=".32"/>
              </g>
              <g fill="#EAC77D">
                <circle cx="706" cy="139" r="1.4" opacity=".7"/>
                <circle cx="995" cy="183" r="1.3" opacity=".72"/>
                <circle cx="837" cy="400" r="1.2" opacity=".6"/>
                <circle cx="1136" cy="508" r="1.3" opacity=".64"/>
                <circle cx="612" cy="616" r="1.2" opacity=".6"/>
                <circle cx="918" cy="687" r="1.2" opacity=".58"/>
                <circle cx="565" cy="747" r="1.3" opacity=".56"/>
              </g>

              <g className="scene-star" transform="translate(714 258)" stroke="#F8E6B2" strokeLinecap="round" filter="url(#glow-3)">
                <path d="M0-12V12M-12 0H12" strokeWidth=".9"/>
                <path d="m-5-5 10 10m0-10L-5 5" strokeWidth=".55" opacity=".65"/>
                <circle r="2" fill="#FFF6D8" stroke="none"/>
              </g>
              <g className="scene-star scene-star--slow" transform="translate(1072 96)" stroke="#F9E7B6" strokeLinecap="round" filter="url(#glow-3)">
                <path d="M0-10V10M-10 0H10" strokeWidth=".8"/>
                <circle r="1.8" fill="#FFF7DB" stroke="none"/>
              </g>
              <g className="scene-star scene-star--late" transform="translate(605 402)" stroke="#B8E5E4" strokeLinecap="round">
                <path d="M0-8V8M-8 0H8" strokeWidth=".7"/>
                <circle r="1.5" fill="#E5FAF4" stroke="none"/>
              </g>
              <g className="scene-star scene-star--slow" transform="translate(1128 583)" stroke="#F9E7B6" strokeLinecap="round">
                <path d="M0-8V8M-8 0H8" strokeWidth=".7"/>
                <circle r="1.5" fill="#FFF7DB" stroke="none"/>
              </g>
              <g className="scene-star scene-star--late" transform="translate(488 735)" stroke="#F9E7B6" strokeLinecap="round">
                <path d="M0-7V7M-7 0H7" strokeWidth=".7"/>
                <circle r="1.3" fill="#FFF7DB" stroke="none"/>
              </g>

              <g className="scene-glow-breathe">
                <ellipse cx="754" cy="670" rx="115" ry="54" fill="url(#core-light)" filter="url(#blur-16)"/>
                <path d="M659 681Q754 622 849 681" stroke="#FFE8A3" strokeOpacity=".4" strokeWidth="9" filter="url(#blur-16)"/>
              </g>

              <ellipse cx="754" cy="704" rx="166" ry="34" fill="#020912" opacity=".72" filter="url(#blur-16)"/>
              <path d="M600 679V699C600 718 669 733 754 733S908 718 908 699V679Z" fill="#171B1d"/>
              <ellipse cx="754" cy="699" rx="154" ry="29" fill="#101820" stroke="#9F7B3D" strokeOpacity=".38"/>
              <path d="M612 685V697C612 712 676 725 754 725S896 712 896 697V685Z" fill="url(#stage-top)"/>
              <ellipse cx="754" cy="684" rx="142" ry="27" fill="url(#stage-top)"/>
              <ellipse cx="754" cy="680" rx="130" ry="22" fill="url(#stage-inner)" stroke="#FFE7A3" strokeOpacity=".75" strokeWidth="1.2"/>
              <ellipse cx="754" cy="680" rx="116" ry="17" stroke="#D6B066" strokeOpacity=".34" strokeWidth=".8"/>
              <path d="M623 683C648 664 844 659 885 681" stroke="#FFF0BB" strokeOpacity=".65" strokeWidth="1.1"/>
              <ellipse cx="754" cy="670" rx="92" ry="24" fill="url(#core-light)" opacity=".86"/>
              <ellipse cx="754" cy="666" rx="36" ry="11" fill="url(#core-light)" filter="url(#glow-7)"/>
              <circle cx="754" cy="662" r="4" fill="#FFF9DE" filter="url(#glow-7)"/>

              <g fill="#FFF0B8" filter="url(#glow-3)">
                <circle className="flow-mote" data-track="track-gold" data-offset="0.08" data-duration="19000" cx="1054" cy="270" r="2.4"/>
                <circle className="flow-mote" data-track="track-cyan" data-offset="0.52" data-duration="23000" cx="947" cy="531" r="2.2"/>
                <circle className="flow-mote" data-track="track-floor" data-offset="0.26" data-duration="21000" cx="405" cy="739" r="2"/>
              </g>
            </svg>
  </div>;
}
