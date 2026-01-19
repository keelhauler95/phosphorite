import React from 'react';
import './style.scss';

interface ScanlinesProps {
  scanlines?: boolean;
  staticNoise?: boolean;
}

const Scanlines: React.FC<ScanlinesProps> = ({ scanlines = true, staticNoise = true }) => {
  if (!scanlines && !staticNoise) {
    return null;
  }

  return (
    <>
      {scanlines && <div className="__scanlines__" />}
      {staticNoise && <div className="__static__" />}
    </>
  );
};

export default Scanlines;
