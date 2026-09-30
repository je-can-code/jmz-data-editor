package mzjson

import "sort"

// OrderLike rearranges the keys of every object in value to follow the matching object in template,
// so a document written over an older copy of itself keeps that copy's key order.
//
// Objects are matched by position: an object member with the template member of the same key, an
// array element with the template element at the same index. Within a matched object, the keys the
// template also has come first, in the template's order, and any keys it lacks follow in the order
// value already had them. Anything the template has no counterpart for keeps its own order.
//
// Matching by index is exact for an unchanged document, and for the parts of a changed one that did
// not move. Where elements were inserted or removed, later elements meet a template of their
// neighbour instead; that can only reorder keys, never change a value, and MZ writes the objects in
// one list in the same order nearly everywhere, so in practice it changes nothing.
func OrderLike(value *Value, template *Value) {
	if value == nil || template == nil || value.Kind != template.Kind {
		return
	}

	if value.Kind == Array {
		for index, item := range value.Items {
			if index < len(template.Items) {
				OrderLike(item, template.Items[index])
			}
		}
		return
	}

	if value.Kind != Object {
		return
	}

	// note where each key sits in the template; a repeated key counts from its first appearance.
	positions := make(map[string]int, len(template.Members))
	for index, member := range template.Members {
		if _, seen := positions[member.Key]; seen == false {
			positions[member.Key] = index
		}
	}

	// keys the template knows go first in its order; the rest keep their relative order after them.
	sort.SliceStable(value.Members, func(left, right int) bool {
		leftPosition, leftKnown := positions[value.Members[left].Key]
		rightPosition, rightKnown := positions[value.Members[right].Key]
		if leftKnown && rightKnown {
			return leftPosition < rightPosition
		}
		return leftKnown && rightKnown == false
	})

	// carry on into each member with its counterpart from the template.
	for _, member := range value.Members {
		if position, known := positions[member.Key]; known {
			OrderLike(member.Value, template.Members[position].Value)
		}
	}
}
