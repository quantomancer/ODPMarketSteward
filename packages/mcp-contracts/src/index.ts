import { z } from "zod";

export const productProfileInputSchema = z.object({}).strict();

export const productProfileOutputSchema = z.object({
  product: z.literal("FXLive Standard FX-35"),
  application: z.literal("ODP Market Steward"),
  classification: z.literal("MARKET DATA DEMO"),
  timeBasis: z.literal("UTC"),
  instrumentCount: z.literal(35),
  standards: z.array(z.string()),
  evidenceMode: z.literal("DECLARED_PRODUCT_PROFILE"),
  limitations: z.array(z.string()),
});

export type ProductProfile = z.infer<typeof productProfileOutputSchema>;
