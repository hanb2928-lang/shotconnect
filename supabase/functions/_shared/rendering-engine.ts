/**
 * Shared rendering rules for virtual try-on and fashion image generation.
 * Enforces zero-text policy, natural fabric preservation, and commercial
 * flexibility (clean whitespace for downstream text overlay).
 */

export const RENDERING_RULES = `
## Virtual Try-On Rendering Rules (Mandatory)

### 1. Zero-Text Policy
- Do NOT generate, overlay, or composite any text, captions, titles, price tags,
  logo text, watermarks, or subtitles onto the output image.
- Even if the prompt or post-processing logic activates a text layer, ignore it
  and output pure visual data only.
- The result must be a clean, text-free image suitable for downstream editing.

### 2. Natural Fabric Preservation
- Preserve the garment's original fabric texture, stitch detail, drape under
  light, and the wearer's natural body silhouette without distortion.
- Do NOT apply excessive filters or artificial graphic effects.
- Output must be photorealistic: accurate fabric weight, natural wrinkles and
  folds, realistic light response on the material surface.
- Maintain accurate color rendering of the original garment — no color shift,
  no pattern hallucination, no invented design elements.

### 3. Commercial Flexibility
- Leave clean negative space and maintain sharp resolution so marketers and
  shop operators can later overlay banners, detail-page text, or SNS editor
  copy without quality degradation.
- Composition should balance the subject with breathing room — avoid filling
  the entire frame edge-to-edge with the model.
`;

/**
 * Builds the fitting prompt with rendering rules injected.
 * Used by the virtual-fitting edge function.
 */
export function buildFittingPromptWithRules(
  basePrompt: string,
  bodyType?: string,
  pose?: string,
  mood?: string,
  sceneStyle?: string,
  customPrompt?: string,
): string {
  const bodyDesc: Record<string, string> = {
    slim: "slim body type (size 44-55)",
    standard: "standard body type (size 66-77)",
    plus: "plus-size body type (size 88-99)",
  };
  const poseDesc: Record<string, string> = {
    front: "facing forward, front view",
    side: "side profile view",
    natural: "natural relaxed pose",
  };
  const moodDesc: Record<string, string> = {
    daily_casual: "bright, cheerful everyday outdoor lighting",
    street_hip: "edgy urban street style with dramatic lighting",
    studio_minimal: "clean minimal studio with soft diffused lighting",
    sunset_warm: "warm golden hour sunset glow",
    natural_outdoor: "natural daylight in an outdoor setting",
  };
  const sceneDesc: Record<string, string> = {
    studio_white: "clean white studio background",
    urban_street: "urban street background with city elements",
    cafe_interior: "cozy cafe interior background",
    beach_outdoor: "beach or seaside outdoor background",
    nature_park: "park or garden with greenery",
    retail_shop: "modern retail shop interior",
  };

  const body = bodyDesc[bodyType ?? "standard"] ?? bodyDesc.standard;
  const poseStr = poseDesc[pose ?? "front"] ?? poseDesc.front;
  const moodStr = moodDesc[mood ?? ""] ?? "clean, neutral studio lighting";
  const sceneStr = sceneDesc[sceneStyle ?? ""] ?? "clean, neutral studio background";

  let prompt = `You are given two images. The first image is a clothing/product garment photo. The second image is a model photo.

Create a realistic virtual fitting result: dress the model in the clothing from the first image. The model should be wearing the garment naturally, with the clothing fitting properly on their body.

CRITICAL — DO NOT DISTORT THE PRODUCT:
- Preserve the EXACT shape, proportions, and silhouette of the original garment from the product photo
- Do NOT stretch, warp, skew, bend, or morph the garment's shape in any way
- Maintain the EXACT original color, pattern, print, texture, and fabric weight of the garment
- Preserve all logos, labels, buttons, zippers, stitching, and hardware exactly as they appear in the product photo
- Do NOT invent or hallucinate new patterns, colors, or design elements that are not in the original product
- The garment's design details (collars, cuffs, hems, pockets) must match the product photo precisely
- If the product has a specific graphic or text print, reproduce it exactly without alteration

Model requirements:
- Keep the model's face, skin tone, and hair exactly the same
- The model has a ${body}
- The model should be in a ${poseStr} pose
- The clothing should look realistic, with natural wrinkles, folds, and fabric texture matching the original product
- Lighting: ${moodStr}
- Background: ${sceneStr}
- The result should look like a professional fashion photograph
- High quality, photorealistic output

${RENDERING_RULES}

Fabric detail requirements:
- Render fabric drape and weight accurately — heavy fabrics (wool, denim) should show structured folds, light fabrics (silk, chiffon) should show flowing movement
- Show natural stitch lines and seam detail where visible
- Preserve the garment's interaction with body movement — tension points at shoulders, waist, and hips should look natural
- Fabric texture (knit, weave, leather grain) must be visible in close-up detail areas

Composition requirements:
- Leave clean negative space around the subject for downstream text overlay
- Frame the model with approximately 15-20% breathing room on each side
- Maintain sharp focus on the garment; background should be softly blurred`;

  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\nAdditional user instructions: ${customPrompt.trim()}`;
  }

  return prompt;
}
