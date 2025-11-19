import React from 'react';

const LocalGenerationSettingsModal: React.FC<any> = ({ isOpen = false, onClose = () => {}, settings = {}, onSave = () => {} }) => {
    if (!isOpen) return null;
    return (
        <div data-testid="LocalGenerationSettingsModal">
            Local Generation Settings (stub)
            <button onClick={() => onSave(settings)}>Save</button>
            <button onClick={onClose}>Close</button>
        </div>
    );
};

export default LocalGenerationSettingsModal;
