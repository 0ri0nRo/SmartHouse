import React from 'react';
import './Button.css';

const Button = ({ children, className = '', variant = 'default', ...props }) => {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
};

export default Button;
