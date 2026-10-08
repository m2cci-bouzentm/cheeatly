import React from 'react';
import Meetings from '../Meetings';
import type { MeetingsProps } from '../Meetings/types';

const Launcher: React.FC<MeetingsProps> = (props) => {
  return <Meetings {...props} />;
};

export default Launcher;
