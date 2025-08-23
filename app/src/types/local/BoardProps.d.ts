import PanelParameter = Sdp.PanelParameter;

type BoardProps = {
  projectPath: string;
};

type SdpParameterEditorProps = {
  parameter: PanelParameter | null;
  updateParameter: (updatedParameter: PanelParameter) => void;
  parameterIdToIconElement: (parameterId: number) => JSX.Element;
}

export {
  BoardProps,
  SdpPanelEditorProps,
  SdpParameterEditorProps
};