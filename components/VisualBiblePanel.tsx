import React from 'react';

const VisualBiblePanel: React.FC<any> = ({ isOpen = false, onClose = () => {} }) => {
    if (!isOpen) return null;
    return (
        <div data-testid="VisualBiblePanel">
            Visual Bible Panel (stub)
            <button onClick={onClose}>Close</button>
        </div>
    );
};

export default VisualBiblePanel;
