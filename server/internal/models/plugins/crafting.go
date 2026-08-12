package plugins

// CraftingConfiguration is the root shape of data/config.crafting.json (J-Crafting++ editor export).
type CraftingConfiguration struct {
	Recipes         []CraftingRecipe         `json:"recipes"`
	Categories      []CraftingCategory       `json:"categories"`
	IngredientTypes []CraftingIngredientType `json:"ingredientTypes,omitempty"`
}

// CraftingRecipe is one craftable row in the configuration.
type CraftingRecipe struct {
	Key                string              `json:"key"`
	Name               string              `json:"name"`
	IconIndex          int                 `json:"iconIndex"`
	Description        string              `json:"description"`
	UnlockedByDefault  bool                `json:"unlockedByDefault"`
	MaskedUntilCrafted bool                `json:"maskedUntilCrafted"`
	CategoryKeys       []string            `json:"categoryKeys"`
	Tools              []CraftingComponent `json:"tools"`
	Ingredients        []CraftingComponent `json:"ingredients"`
	Outputs            []CraftingComponent `json:"outputs"`
	// Cost is what a shop charges to teach this recipe, paid once. It is omitted when empty so that
	// the thousand-odd recipes authored before recipes could be bought keep the shape they were
	// written with - and because a null here would be handed to the plugin, which iterates it.
	Cost []CraftingComponent `json:"cost,omitempty"`
}

// CraftingComponent is a single tool, ingredient, or output slot.
//
// A slot names either one exact database row (Id plus Type) or, for ingredients only, a set of ingredient type keys
// that anything in the player's inventory may satisfy. Categories is omitted when empty so that the thousand-odd
// existing slots keep the shape they were written with.
type CraftingComponent struct {
	Id         int      `json:"id"`
	Type       string   `json:"type"`
	Count      int      `json:"count"`
	Categories []string `json:"categories,omitempty"`
}

// CraftingIngredientType is one authored ingredient classification, such as "protein" or "flank".
//
// These are a flat vocabulary rather than a hierarchy: an entry carries whatever set of them its author decides, and
// a recipe slot is satisfied by anything carrying every type the slot asks for. Narrower slots therefore match fewer
// things, which is the whole mechanism behind common versus signature dishes.
type CraftingIngredientType struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	IconIndex   int    `json:"iconIndex"`
	Description string `json:"description"`
}

// CraftingCategory is a recipe grouping row in the configuration.
type CraftingCategory struct {
	Key               string `json:"key"`
	Name              string `json:"name"`
	IconIndex         int    `json:"iconIndex"`
	Description       string `json:"description"`
	UnlockedByDefault bool   `json:"unlockedByDefault"`
}
