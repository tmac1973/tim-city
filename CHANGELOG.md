# Changelog

## 2.0.0

The modern city expansion: density, new power, utilities, transit and landmarks.

### Zones
- Zones are painted at **low, medium or high density**, capping growth at level 3, 6 or 8. High density unlocks at Town and only grows past level 6 on good land value.
- Zoning costs $100, $200 or $400 a lot by tier. Painting over existing lots of the same type changes their tier in place and keeps the buildings; moving up pays the difference, moving down costs $50.
- The Zones flyout has a tier picker, the zone keys cycle the tier, empty lots show tier stripes, and a Zoning overlay shades lots by tier. The query panel says why a lot isn't growing.

### Power
- **Wind turbine** (1×1, $400): 40 units, 60 on high ground. **Solar farm** ($2,500): 300 units, 180 in an overcast month. **Gas plant** ($2,200): 500 units, half the smoke of coal. **Oil plant** ($2,600, unlocks at City): 1,000 units, smoky, and prone to fire.
- Each month may be overcast; the sky leans cloudy when it is.

### Water and garbage
- **Water towers** ($600, $60 a year) and **landfills** ($1,000, $90 a year) serve the zones around them up to a capacity. Lots without water stop at level 4; places where garbage isn't collected lose land value, and so does living beside a landfill.
- Cities saved before 2.0 get a two-year grace period with warnings in the news.
- New Water and Garbage advisor problems and overlays.

### Transit
- **Bus stops** ($150, $10 a year) beside roads link into routes with stops within 12 road tiles. Lots near a stop ride the routes at a discount and put a quarter of the cars on those roads. Yellow buses drive the routes and can be followed.
- **Subway** (unlocks at City): track at $40 a tile runs under anything; **stations** ($800) link it to the road beside them. Trips ride the track cheaply and add no road traffic. Press **V** for the underground view.
- New Transit and Water-and-garbage budget lines, each with a funding slider.

### Landmarks
- **City Hall**, **Hospital** and **Statue** at Town; **Museum**, **Zoo** and **Clock tower** at City; **University**, **Amusement park** and the **"TIM" sign** at Capital. They raise approval, land value, residential growth, or (the university) cut industrial pollution and raise its taxes.
- Leisure landmarks earn tourism each month when a road reaches them from the map edge.

### Building
- The toolbar is now one button per category, each opening a flyout. Tools unlock at population milestones, and the milestone toast lists what's new.
- Roads grade beside buildings: a lot takes the change on its plinth if it can, and otherwise the road is graded to meet it.
- A lot guide shows which 3×3 lots fit beside the road being drawn; parallel roads snap to lot-sized gaps (Alt to place freely); the **Block** tool (H) lays a ring of road sized to whole lots, optionally zoned inside.

### Saves
- Save format 6. Older saves load: existing zones become high density, new funding lines start at 100%, and water and garbage wait two years.
