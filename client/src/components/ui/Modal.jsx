import React from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
};

const ModalHeader = ({ children }) => <div className="modal-header">{children}</div>;
const ModalTitle = ({ children }) => <h2 className="modal-title">{children}</h2>;
const ModalBody = ({ children }) => <div className="modal-body">{children}</div>;
const ModalFooter = ({ children }) => <div className="modal-footer">{children}</div>;

export { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter };
