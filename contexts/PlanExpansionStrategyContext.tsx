import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { PlanExpansionStrategy } from '../types';
import { usePersistentState } from '../utils/hooks';
import { createPlanExpansionActions, PlanExpansionActions } from '../services/planExpansionService';
import { DEFAULT_PLAN_STRATEGIES, FALLBACK_PLAN_STRATEGY, PLAN_STRATEGY_STORAGE_KEY } from '../utils/contextConstants';

type PlanExpansionStrategyContextValue = {
    strategies: PlanExpansionStrategy[];
    availableStrategies: PlanExpansionStrategy[];
    activeStrategy: PlanExpansionStrategy;
    activeStrategyId: string;
    selectStrategy: (id: string) => void;
    actions: PlanExpansionActions;
};

const PlanExpansionStrategyContext = createContext<PlanExpansionStrategyContextValue | undefined>(undefined);

export const PlanExpansionStrategyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [selectedStrategyId, setSelectedStrategyId] = usePersistentState<string>(PLAN_STRATEGY_STORAGE_KEY, FALLBACK_PLAN_STRATEGY.id);

    const strategies = DEFAULT_PLAN_STRATEGIES;

    const availableStrategies = useMemo(
        () => strategies.filter(strategy => strategy.isAvailable),
        [strategies]
    );

    const fallbackStrategy = useMemo(() => {
        const defaultAvailable = strategies.find(strategy => strategy.isDefault && strategy.isAvailable);
        if (defaultAvailable) {
            return defaultAvailable;
        }
        const firstAvailable = strategies.find(strategy => strategy.isAvailable);
        return firstAvailable ?? strategies[0];
    }, [strategies]);

    useEffect(() => {
        const selected = strategies.find(strategy => strategy.id === selectedStrategyId);
        if (!fallbackStrategy) {
            return;
        }
        if (!selected || !selected.isAvailable) {
            if (selectedStrategyId !== fallbackStrategy.id) {
                setSelectedStrategyId(fallbackStrategy.id);
            }
        }
    }, [selectedStrategyId, strategies, fallbackStrategy, setSelectedStrategyId]);

    const activeStrategy = useMemo(() => {
        const match = strategies.find(strategy => strategy.id === selectedStrategyId && strategy.isAvailable);
        return match ?? fallbackStrategy;
    }, [strategies, selectedStrategyId, fallbackStrategy]);

    const selectStrategy = useCallback(
        (id: string) => {
            const target = strategies.find(strategy => strategy.id === id);
            if (!target) {
                console.warn(`[PlanExpansionStrategy] Unknown strategy requested: ${id}`);
                return;
            }
            if (!target.isAvailable) {
                console.warn(`[PlanExpansionStrategy] Strategy ${id} is not available yet.`);
                return;
            }
            setSelectedStrategyId(id);
        },
        [strategies, setSelectedStrategyId]
    );

    const actions = useMemo(() => createPlanExpansionActions(activeStrategy.id), [activeStrategy.id]);

    const value = useMemo<PlanExpansionStrategyContextValue>(() => ({
        strategies,
        availableStrategies,
        activeStrategy,
        activeStrategyId: activeStrategy.id,
        selectStrategy,
        actions,
    }), [strategies, availableStrategies, activeStrategy, selectStrategy, actions]);

    return (
        <PlanExpansionStrategyContext.Provider value={value}>
            {children}
        </PlanExpansionStrategyContext.Provider>
    );
};

export const usePlanExpansionStrategy = (): PlanExpansionStrategyContextValue => {
    const context = useContext(PlanExpansionStrategyContext);
    if (!context) {
        throw new Error('usePlanExpansionStrategy must be used within a PlanExpansionStrategyProvider');
    }
    return context;
};

export const usePlanExpansionActions = (): PlanExpansionActions => {
    return usePlanExpansionStrategy().actions;
};
