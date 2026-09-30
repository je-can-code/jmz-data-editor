package mzjson

import "encoding/json"

// Render produces the bytes a file should hold for document, laid out by layout.
//
// The output is built from the document as its Go model encodes it, never from whatever JSON the
// model was decoded from. Go matches keys case-insensitively and keeps the last of any repeated key
// when it decodes, so a request body can reach the model under spellings the game would not
// recognise; encoding the model back is what guarantees only the model's own spellings reach disk.
//
// template is the file currently on disk, when there is one. Its key order is kept wherever the
// document still has the same objects (see OrderLike), which is what makes saving an unchanged
// document reproduce the file exactly. A template that is missing or is not valid JSON is simply
// not used, and the model's own field order stands.
func Render(document any, template []byte, layout Layout) ([]byte, error) {
	encoded, err := json.Marshal(document)
	if err != nil {
		return nil, err
	}

	value, err := Parse(encoded)
	if err != nil {
		return nil, err
	}

	if len(template) > 0 {
		if previous, parseErr := Parse(template); parseErr == nil {
			OrderLike(value, previous)
		}
	}

	return layout(value)
}
