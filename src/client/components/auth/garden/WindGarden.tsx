import React, {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Check,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { Expressbank3DInspector } from "../../common/Expressbank3DInspector.js";
import { GardenFallback } from "./GardenFallback.js";
import { DayCycleControls } from "./DayCycleControls.js";
import type { DayCycleController } from "./useDayCycle.js";
import {
  createGarden,
  advanceGarden,
  gardenSolved,
  turnInstrument,
  type GardenPhase,
} from "./garden-state.js";

const GardenScene = lazy(() => import("./GardenScene.js"));

class GardenBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function WindGarden({
  dayCycle,
  language,
  phase,
  reducedMotion,
}: {
  dayCycle: DayCycleController;
  language: "az" | "en";
  phase: GardenPhase;
  reducedMotion: boolean;
}) {
  const [state, setState] = useState(() => createGarden());
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(false);
  const [gust] = useState(0);
  const [resetView] = useState(0);
  const [discovery, setDiscovery] = useState<"bell" | null>(null);
  const [show3DInspector, setShow3DInspector] = useState(false);

  const copy = (en: string, az: string) => (language === "az" ? az : en);

  const turn = useCallback(
    (index: number) => setState((previous) => turnInstrument(previous, index)),
    [],
  );
  const onReady = useCallback(() => setReady(true), []);
  const onLowPerformance = useCallback(() => setPaused(true), []);
  const onUnavailable = useCallback(() => {
    setUnavailable(true);
    setReady(false);
  }, []);

  const solved = gardenSolved(state);
  const finished = state.chapter === 2 && solved;

  useEffect(() => {
    if (!solved) return;
    setOpen(true);
    if (state.chapter !== 1) return;
    const timer = window.setTimeout(
      () => setState((previous) => advanceGarden(previous)),
      1600,
    );
    return () => window.clearTimeout(timer);
  }, [solved, state.chapter]);

  return (
    <section
      className="wind-garden"
      aria-label={copy(
        "The Wind Garden. An optional interactive miniature.",
        "Külək bağı. İnteraktiv miniatür.",
      )}
    >
      <div className="garden-catalog">
        <span className="garden-catalog__line" />
        <span>{copy("THE WIND GARDEN", "KÜLƏK BAĞI")}</span>
        <DayCycleControls
          cycle={dayCycle}
          language={language}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className={`garden-stage ${ready ? "is-ready" : ""}`}>
        <GardenFallback
          bloomed={state.chapter === 2 || solved}
          finished={finished}
        />
        {!unavailable && (
          <GardenBoundary onError={onUnavailable}>
            <Suspense fallback={null}>
              <GardenScene
                daylight={dayCycle.daylight}
                state={state}
                phase={phase}
                paused={paused}
                reducedMotion={reducedMotion}
                gust={gust}
                resetView={resetView}
                onTurn={turn}
                onReady={onReady}
                onLowPerformance={onLowPerformance}
                onUnavailable={onUnavailable}
                onDiscovery={(kind) => {
                  if (kind === "bird") {
                    setShow3DInspector(true);
                  } else {
                    setDiscovery(kind);
                  }
                }}
              />
            </Suspense>
          </GardenBoundary>
        )}
      </div>

      <div className="garden-caption">
        <span>01 — 03</span>
        <span>
          {copy(
            "Clay. Paper. A passing breeze.",
            "Gil. Kağız. Ötüb keçən meh.",
          )}
        </span>
      </div>

      <div className="garden-editorial">
        <p className="garden-eyebrow">
          {copy("A SMALL WORLD, BEFORE YOURS.", "İŞDƏN ÖNCƏ, KİÇİK BİR DÜNYA.")}
        </p>
        <h1>
          {copy("Let curiosity", "Marağa")}
          <br />
          <em>{copy("take a moment.", "bir an ayırın.")}</em>
        </h1>
        <p>
          {copy(
            "Even a little wind can set something in motion.",
            "Kiçik bir meh belə nəyisə hərəkətə gətirə bilər.",
          )}
        </p>
      </div>

      {/* Secret Flower Rotation Dial Puzzle (Easter Egg) */}
      {open && (
        <div
          className="garden-puzzle"
          id="garden-puzzle"
          data-chapter={state.chapter}
          data-complete={finished}
        >
          <div className="garden-puzzle__heading">
            <span className="garden-puzzle__tag">
              <Sparkles size={13} />
              {state.chapter === 1
                ? copy("01 / THE FIRST BLOOM · EASTER EGG", "01 / İLK ÇİÇƏK · EASTER EGG")
                : copy("02 / THE SECRET WIND · EASTER EGG", "02 / GİZLİ KÜLƏK · EASTER EGG")}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={copy("Close wind puzzle", "Külək tapmacasını bağla")}
            >
              <X size={17} />
            </button>
          </div>

          <h2 aria-live="polite">
            {finished
              ? copy("The garden has bloomed.", "Bağ çiçəkləndi.")
              : solved
                ? copy("A second breeze is waking…", "İkinci meh oyanır…")
                : state.chapter === 2
                  ? copy(
                      "The sails are connected now.",
                      "Yelkənlər indi bir-birinə bağlıdır.",
                    )
                  : copy(
                      "Three sails. One perfect breeze.",
                      "Üç yelkən. Bir mükəmməl meh.",
                    )}
          </h2>

          <p>
            {finished
              ? copy(
                  "A moonflower opens. Paper butterflies take flight. You brought this little world to life.",
                  "Ay çiçəyi açılır. Kağız kəpənəklər uçuşur. Bu kiçik dünyanı siz oyatdınız.",
                )
              : state.chapter === 2
                ? copy(
                    "Each turn also moves the next sail: 01 → 02 → 03 → 01. Align all three to reveal what sleeps beneath the arch.",
                    "Hər gediş növbəti yelkəni də çevirir: 01 → 02 → 03 → 01. Tağın altındakı sirri açmaq üçün üçünü də uyğunlaşdırın.",
                  )
                : copy(
                    "Turn each copper pointer toward its green mark. Something is waiting to bloom.",
                    "Hər mis əqrəbi yaşıl nişana yönəldin. Nəsə çiçəklənməyi gözləyir.",
                  )}
          </p>

          <div className="garden-dials">
            {state.turns.map((value, i) => (
              <button
                key={i}
                type="button"
                disabled={solved}
                onClick={() => turn(i)}
                aria-label={copy(
                  `Turn sail ${i + 1}: position ${(value % 8) + 1}, target ${state.targets[i] + 1}`,
                  `${i + 1}-ci yelkəni çevir: mövqe ${(value % 8) + 1}, hədəf ${state.targets[i] + 1}`,
                )}
              >
                <span className="garden-dial">
                  <svg viewBox="0 0 64 64" aria-hidden="true">
                    <circle cx="32" cy="32" r="25" />
                    {Array.from({ length: 8 }, (_, n) => (
                      <circle
                        key={n}
                        cx={32 + Math.sin((n * Math.PI) / 4) * 25}
                        cy={32 - Math.cos((n * Math.PI) / 4) * 25}
                        r={state.targets[i] === n ? 4 : 1.7}
                        className={state.targets[i] === n ? "is-target" : ""}
                      />
                    ))}
                    <path
                      d="M32 32V13"
                      transform={`rotate(${value * 45} 32 32)`}
                    />
                    <circle cx="32" cy="32" r="3" />
                  </svg>
                </span>
                <span>
                  0{i + 1}{" "}
                  {value % 8 === state.targets[i] ? (
                    <Check size={12} />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                </span>
              </button>
            ))}
          </div>

          <div className="garden-puzzle__footer">
            <span role="status">
              {state.moves} {copy("turns", "gediş")} ·{" "}
              {state.turns.filter((v, i) => v % 8 === state.targets[i]).length}
              /3
            </span>
            <button
              type="button"
              onClick={() => setState(createGarden(state.round + 1))}
            >
              <RotateCcw size={12} />
              {copy("Start again", "Yenidən başla")}
            </button>
          </div>
        </div>
      )}

      {/* Bell discovery tip */}
      {discovery && !open && (
        <p className="garden-discovery" role="status">
          {discovery === "bell"
            ? copy(
                "A small bell. A very large silence.",
                "Kiçik bir zəng. Böyük bir sükut.",
              )
            : null}
          <button
            onClick={() => setDiscovery(null)}
            type="button"
            aria-label={copy("Dismiss", "Bağla")}
          >
            <X size={12} />
          </button>
        </p>
      )}

      {/* Interactive 3D Expressbank Monument Inspector */}
      {show3DInspector && (
        <Expressbank3DInspector
          isOpen={show3DInspector}
          onClose={() => setShow3DInspector(false)}
          language={language}
        />
      )}
    </section>
  );
}
