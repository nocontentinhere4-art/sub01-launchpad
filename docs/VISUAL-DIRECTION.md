# Tokyo visual direction

The owner’s three supplied photos guide the scene: Shibuya’s busy illuminated crossing, a city skyline with Tokyo Tower and Fuji, and a narrow commercial street dense with vertical signage.

Interpretation in the current prototype:

- Shibuya: crossing stripes, cars, cyan/orange sign bands and rooftop screens.
- Skyline: taller secondary towers and a faceted Fuji with an irregular white snow cap. Scale and placement prioritize the diorama, not geographic accuracy.
- Commercial streets: vertical Japanese/English signs, shop canopies, brackets, small street lights and vending machines. Signs are generic original text rather than copied storefront images.
- Night: deep blue backdrop, warm windows, cyan/orange storefront accents, a readable dark interface.

All visual additions are procedural geometry plus one generated 1024 x 1024 sign atlas. No reference photo is embedded into the scene. Geometry is batched, with no bloom, reflections, volumetric effects or extra dynamic lights. Rebuilding a project regenerates its nearby decor and disposes the previous geometry/material/atlas resources. Actual phone GPU usage still requires device profiling.
