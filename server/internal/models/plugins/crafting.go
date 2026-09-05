package plugins

import "encoding/json"

// CraftingConfiguration is the root shape of data/config.crafting.json (J-Crafting++ editor export).
//
// Nothing here is omitempty. An absent field and a deliberately empty one are the same bytes, which
// makes "this profession sells nothing" indistinguishable from "nobody authored this yet" - and it
// pushes the reading side into coalescing every field it touches. The editor writes the whole shape
// every time, so the plugin can trust it.
type CraftingConfiguration struct {
	Recipes         []CraftingRecipe         `json:"recipes"`
	Categories      []CraftingCategory       `json:"categories"`
	IngredientTypes []CraftingIngredientType `json:"ingredientTypes"`
	Professions     []CraftingProfession     `json:"professions"`
}

// CraftingProfession is a family of categories that share a currency and a price ladder.
//
// A profession is what a scrap buys and what a tier costs, which are the two questions a category alone
// could never answer. Before this existed the plugin decided both by matching category keys against
// hardcoded prefixes, so the answer lived in code, keyed off a string that could be renamed at any time,
// and could not express a line whose materials belong to a different craft than its prefix suggests.
//
// TierPrices is indexed by tier, lowest first, so its length is the profession's depth: cooking declares
// four, survival declares ten, and neither needs to know the other exists. A tier past the end of the
// table simply has no price, which is how a roster can grow past its economy without pricing itself by
// accident. A profession with no prices at all is not for sale - which is correct for one whose recipes
// are placed by hand in the world rather than taught by a shop.
type CraftingProfession struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	IconIndex   int    `json:"iconIndex"`
	Description string `json:"description"`
	// ScrapItemId is the item spent to learn any recipe in this profession, or 0 when nothing here is
	// bought at all.
	ScrapItemId int `json:"scrapItemId"`
	// TierPrices is how much scrap each tier costs, the first entry being tier 1. An empty table is a
	// statement rather than an absence: this profession's recipes are found, not taught.
	TierPrices []int `json:"tierPrices"`
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
	// Cost is what a shop charges to teach this recipe, paid once. An empty cost means the recipe takes
	// whatever its profession charges for its tier; naming a cost here opts out of that entirely.
	//
	// Typed as CraftingComponents so that an unpriced recipe writes as [] rather than null - see that
	// type for why the distinction matters here and nowhere else in this struct.
	Cost CraftingComponents `json:"cost"`
	// Tier is how far up its family a recipe sits, and it exists so that a price does not have to be
	// written five hundred times. The plugin turns a tier into a scrap cost through a table of its
	// own, which is why no currency appears here. Cost still wins where it is set: the tier is the
	// rule and the cost is the exception. Zero means untiered, and an untiered recipe with no cost is
	// simply not for sale.
	Tier int `json:"tier"`
}

// CraftingComponents is a component slice that writes as [] rather than null when it holds nothing.
//
// Go marshals a nil slice to null, and the plugin iterates a recipe's cost - so null arrives as a value
// that cannot be iterated and throws at boot, where an empty array is simply "this recipe is not for
// sale". Every one of the 933 recipes Chef Adventure ships carries "cost": [], and none carries null.
//
// Cost is the only field in a recipe that is ever legitimately empty; a recipe with no outputs or no
// ingredients is not a recipe, so its siblings never reach this case and do not need the type.
type CraftingComponents []CraftingComponent

// MarshalJSON writes an empty component list as [] instead of letting a nil slice become null.
func (components CraftingComponents) MarshalJSON() ([]byte, error) {
	if components == nil {
		return []byte("[]"), nil
	}

	return json.Marshal([]CraftingComponent(components))
}

// CraftingComponent is a single tool, ingredient, or output slot.
//
// A slot names either one exact database row (Id plus Type) or, for ingredients only, a set of ingredient type keys
// that anything in the player's inventory may satisfy. An empty Categories is how a slot says it names an exact row.
type CraftingComponent struct {
	Id         int      `json:"id"`
	Type       string   `json:"type"`
	Count      int      `json:"count"`
	Categories []string `json:"categories"`
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
	// ProfessionKey names the CraftingProfession this category belongs to, which is what decides the
	// scrap its recipes are bought with and the price ladder their tiers read from. An empty key means
	// this category joins no profession, so nothing in it is for sale.
	ProfessionKey string `json:"professionKey"`
}
