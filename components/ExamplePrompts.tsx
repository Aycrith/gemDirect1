import React from 'react';
import SparklesIcon from './icons/SparklesIcon';

const examples = [
    {
        title: "Gritty Action Scene",
        prompt: "`A tense, gritty sequence. Start with a **Handheld Tracking Shot**, following a figure sprinting down a rain-slicked alley lit by harsh **Neon Glow**. --[J-Cut]--> to an **Extreme Close-Up** on their determined face, with **Shallow Depth of Field** blurring the background. End with a **Whip Pan** as they vault over a dumpster, enhanced with subtle **Motion Blur** and a cool, **Desaturated** color grade.`"
    },
    {
        title: "Dreamlike Montage",
        prompt: "`A nostalgic, dreamlike montage. Begin with a **Full Shot** of a couple on a beach at **Golden Hour**, with significant **Lens Flare**. --[Dissolve]--> into a **Point of View** shot of hands intertwined, with a soft **Deep Focus** and visible **Film Grain**. The pacing should be **Slow Motion** throughout, with a warm, magical mood.`"
    }
]

const ExamplePrompts: React.FC = () => {
    return (
        <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6">
            <h3 className="flex items-center text-lg font-semibold text-gray-200 mb-4">
                <SparklesIcon className="w-5 h-5 mr-2 text-indigo-400" />
                Example Remix Prompts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {examples.map(ex => (
                    <div key={ex.title} className="bg-gray-900/50 p-4 rounded-md border border-gray-700">
                        <h4 className="font-bold text-indigo-400 mb-2">{ex.title}</h4>
                        <p className="text-sm text-gray-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: ex.prompt.replace(/`--\[(.*?)\]-->`/g, '<span class="text-indigo-400 font-mono">--[$1]--&gt;</span>').replace(/`(.*?)`/g, '<code class="text-gray-300 bg-gray-700/50 px-1 py-0.5 rounded-sm">$1</code>') }} />
                    </div>
                ))}
            </div>
        </div>
    )
};

export default React.memo(ExamplePrompts);
