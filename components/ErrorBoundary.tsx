import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    FallbackComponent?: React.ComponentType<{ error: Error; resetError: () => void }>;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in child component tree.
 * Logs error details and displays a fallback UI.
 */
class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error
        };
    }

    override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error);
        console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
        
        // Call optional error callback
        this.props.onError?.(error, errorInfo);
    }

    resetError = () => {
        this.setState({
            hasError: false,
            error: null
        });
    };

    override render() {
        if (this.state.hasError && this.state.error) {
            if (this.props.FallbackComponent) {
                return (
                    <this.props.FallbackComponent 
                        error={this.state.error} 
                        resetError={this.resetError} 
                    />
                );
            }

            // Default fallback UI
            return (
                <div className="p-4 bg-red-900/20 border border-red-500 rounded-md" data-error-boundary>
                    <h3 className="text-red-400 font-semibold mb-2">Something went wrong</h3>
                    <p className="text-sm text-gray-300 mb-3">{this.state.error.message}</p>
                    <button
                        onClick={this.resetError}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
