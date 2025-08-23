import {
  SxProps,
  Tab,
  Theme
} from "@mui/material";

type TabProps = {
  label: string;
  icon: any;
  sx?: SxProps<Theme> | undefined;
};

const JmzTabStyles = {
  color: 'grey',
};

export default function JmzTab(props: TabProps)
{
  return <>
    <Tab
      label={props.label}
      icon={props.icon}
      sx={props.sx ?? JmzTabStyles}
    />
  </>
}