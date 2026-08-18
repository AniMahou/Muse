import type { ObservationCore } from "@shared/observation.schema";
import type { Annotations } from "@shared/stage-io";
import type { ILlmProvider } from "@/pipeline/ports";
import { buildAssemblySchema, vocabularyFrom } from "./schema";
import { SYSTEM_PROMPT, renderUserPrompt } from "./prompt";
import type { AssembleStageInput, AssembleStageOptions, AssembleStageOutput } from "./types";

/** Quantities are floats; compare with a tolerance rather than by identity. */
const QUANTITY_EPSILON = 1e-6;

/**
 * Stage 5 — assemble annotations into observations.
 *
 * The only stage that calls a language model, and it is deliberately given
 * the narrowest job in the pipeline: decide how many observations a recording
 * contains, which mentions belong to which, and what each one MEANS. It never
 * identifies a product or an outlet — stages 3 and 4 already did that, and
 * the response schema is rebuilt per clip so that naming anything outside
 * their candidates is not expressible.
 *
 * Numbers get a second guard. The schema cannot constrain a float the way it
 * constrains an identifier, so any quantity or price the model returns is
 * checked against what the grammar actually parsed and dropped if it does not
 * appear there. A model that quietly converts eighteen pieces into one and a
 * half dozen — or invents a plausible number for a field nobody spoke — is
 * the most expensive failure this system can have, and it is not one the
 * schema alone can prevent.
 */
export class AssembleStage {
  readonly name = "05-assemble";

  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(
    private readonly llm: ILlmProvider,
    opts: AssembleStageOptions = {},
  ) {
    this.temperature = opts.temperature ?? 0;
    this.maxTokens = opts.maxTokens ?? 2048;
  }

  async run(input: AssembleStageInput): Promise<AssembleStageOutput> {
    const { transcript, annotations } = input;

    const vocab = vocabularyFrom(annotations);
    const schema = buildAssemblySchema(vocab);
    const user = renderUserPrompt(transcript, annotations, vocab);

    const { data } = await this.llm.complete({
      system: SYSTEM_PROMPT,
      user,
      schema,
      schemaName: "MuseAssembly",
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    });

    return this.enforceNumbers(data.observations as ObservationCore[], annotations);
  }

  /**
   * Drop any number the grammar did not actually parse.
   *
   * Identity fields are already safe by construction; numbers are not. This
   * keeps stage 2 the single source of truth for every quantity and price in
   * the system, so a value on a dashboard can always be traced to a specific
   * span of speech.
   */
  private enforceNumbers(
    observations: ObservationCore[],
    annotations: Annotations,
  ): AssembleStageOutput {
    const allowedValues = new Set(annotations.quantities.map((q) => q.value));
    const rejected: AssembleStageOutput["rejectedValues"] = [];

    const cleaned = observations.map((obs) => {
      const out = { ...obs };

      if (out.quantity !== null && !isAllowed(out.quantity, allowedValues)) {
        rejected.push({
          field: "quantity",
          value: out.quantity,
          reason: "not present in parsed quantities",
        });
        out.quantity = null;
        out.unit = null;
      }

      // A price delta may legitimately be negative where the parsed quantity
      // was positive ("পাঁচ টাকা কম" is 5, meaning -5), so compare magnitudes.
      if (out.priceDelta !== null && !isAllowed(Math.abs(out.priceDelta), allowedValues)) {
        rejected.push({
          field: "priceDelta",
          value: out.priceDelta,
          reason: "not present in parsed quantities",
        });
        out.priceDelta = null;
      }

      return out;
    });

    return { observations: cleaned, rejectedValues: rejected };
  }
}

function isAllowed(value: number, allowed: Set<number>): boolean {
  for (const a of allowed) if (Math.abs(a - value) < QUANTITY_EPSILON) return true;
  return false;
}
