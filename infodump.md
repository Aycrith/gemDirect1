Enhancing GemDirect1 – Roadmap to High-Quality AI Video Generation

Introduction: The GemDirect1 project already has strong foundations (robust testing scripts, telemetry, and solid VRAM management practices), but several “loose ends” need to be tied up. The goal is to integrate advanced systems so that GemDirect1 can produce long-form videos with the coherence and quality approaching state-of-the-art solutions (e.g. OpenAI’s Sora 2). Below we outline a phased plan to refine the current architecture and incorporate cutting-edge techniques.

Phase 1: Solidify the Existing Architecture

1. Integrate the UI “Generate Video” Button: Currently, users must export prompts manually and run a PowerShell helper (scripts/generate-scene-videos-wan2.ps1). We should wire the React front-end’s “Generate Video” button to trigger this generation pipeline directly. This could be done by calling the ComfyUI workflow via its API (e.g. an HTTP POST to ComfyUI’s /prompt endpoint or a WebSocket) or spawning the PowerShell script as a child process from the Node/Express backend. The integration ensures a one-click workflow – when the user clicks Generate, the app will queue up the ComfyUI video generation job and later retrieve the output. In practice, this means no more context switching for the user, moving the project from a manual workaround to an end-to-end integrated application.

 

2. Optimize VRAM Utilization (Low VRAM Mode & Quantization): Running the local Mistral 7B LLM on CPU has already freed GPU memory for the 14B video diffusion model. We can push this further by enabling ComfyUI’s --lowvram mode at launch, which splits the model across GPU memory in chunks to reduce peak usage
docs.comfy.org
. Even on a 24 GB RTX 3090, this can provide headroom and reduce reliance on slow system-memory offloading. More importantly, consider using quantized model formats (GGUF) for the massive WAN 2.2 model. The community has produced GGUF quantizations of WAN 2.2 (both high-noise and low-noise weights) that dramatically shrink VRAM usage at minimal quality loss
reddit.com
. For example, the 14B WAN 2.2 in 4-bit GGUF is ~8.5 GB per model instead of ~14–20 GB, allowing the full model (high + low noise) to fit comfortably in VRAM
reddit.com
reddit.com
. Users with 12 GB cards have reported that using the GGUF models avoids slow CPU offloading and speeds up generation significantly
reddit.com
. On the 24 GB system, using the GGUF version will ensure nearly all frames render on GPU, avoiding the dramatic slowdowns when spilling to RAM. In summary, launch ComfyUI with low-VRAM optimizations and load the GGUF quantized WAN 2.2 models (and the UMT5-XXL text encoder in GGUF) to maximize performance on available hardware.

 

3. Formalize LoRA and ControlNet Workflows: To maintain consistent characters and styles across scenes, fully integrate LoRAs and ControlNets into the default pipelines. The codebase already supports applying LoRAs and ControlNet (e.g. depth, pose) in ComfyUI, but we should provide default example workflows and documentation so users can easily leverage them. For example, if a user has a LoRA for a main character’s face or a specific art style, the workflow JSON should include the LoRA Loader node and appropriate weights by default. Likewise, include ControlNet nodes (if the user supplies a sketch, pose, or depth map) so that each scene’s generation can optionally use them for guidance. This addresses the desire for dynamic yet consistent characters: by using the same LoRA (character appearance) and ControlNet conditioning (e.g. pose sequence or composition) across scenes, the model will produce the same character in every shot. GemDirect1 can provide a library of example ControlNet inputs – for instance, a default human pose skeleton that persists scene to scene – to help maintain continuity. As one community member noted, achieving character consistency often requires a combination of techniques: consistent prompt tokens, identity embeddings (e.g. IP Adapter), fixed seeds, LoRA fine-tunes, and face alignment tools
reddit.com
. We should incorporate these: e.g. allow an “anchor image” of the character with an IP-Adapter node for identity reference, and keep certain prompt keywords constant (name/description of character) in the prompt generator. All these pieces, when documented and enabled, will give users fine control over recurring characters. (ControlNet alone can make the environment and poses consistent, though it won’t guarantee facial identity across scenes
reddit.com
 – hence the need to combine it with LoRA or reference images for the character’s face). By formalizing these multi-technique workflows, we greatly improve narrative continuity for long-form videos.

 

4. Tune CFG Defaults for Stability: Through internal testing, it appears that a CFG (classifier-free guidance) scale around 5.0–5.5 yields the best balance of quality vs. stability for WAN 2.2. Higher CFG values (e.g. 6.0) often cause erratic frames or failure cases in video diffusion. We should update the default localGenSettings.json (or equivalent config) to use a conservative CFG (≈5.2) by default, explicitly avoiding 6.0+. This will steer new generations toward the known “safe zone.” We can leverage the existing validate-run-summary telemetry to verify that failure rates indeed spike at CFG 6 – and by locking the default lower, we reduce the chance of a bad frame derailing a whole sequence. In tandem, note that the community has developed “Lightning LoRA” for WAN 2.2 which essentially distills the model to work with fewer diffusion steps (e.g. 4 steps total)
nextdiffusion.ai
. Using such LoRAs (already in the repo or readily downloadable) can allow keeping CFG lower while still getting sharp results, since the LoRA biases the model toward higher fidelity in fewer steps
nextdiffusion.ai
. In short, optimize the generation parameters: set sane defaults (CFG, steps) to known good values so that out-of-the-box runs succeed consistently.

Phase 2: Long-Form Quality Enhancements

1. Make FLF2V (First–Last-Frame-to-Video) the Default Mode: A top priority for long-form narrative coherence is adopting the First–Last Frame to Video generation approach as the standard pipeline for multi-scene videos. WAN 2.2 introduced a FLF2V mode where you supply both the starting frame and ending frame for a scene, and the model then generates a smooth video that transitions between those keyframes
nextdiffusion.ai
. This technique ensures controlled motion: rather than the AI free-styling the whole sequence (which can drift or introduce discontinuities), you explicitly anchor the scene’s endpoints. To integrate this:

Generate Key Frames: For each scene or shot, use the prompt (and perhaps an LLM-proposed scene description) to generate a first frame and a last frame. These could be generated by a standard image model or by the video model itself in still-image mode. The first frame of the very first scene can be purely prompt-based; for subsequent scenes, the first frame will often be the last frame of the previous scene if continuous.

Chain Scene Transitions: Modify generate-scene-videos-wan2.ps1 (or its logic in code) so that when scene N+1 begins, it automatically loads the final frame from scene N as the initial conditioning image for the next video. In ComfyUI, this means feeding that image into the Image-to-Video (I2V) node for scene N+1’s workflow. By doing so, scene transitions become seamless continuations – e.g. your protagonist’s last pose in scene 1 will carry over as the starting point of scene 2. This is crucial for narrative flow (no sudden costume or position changes unless intended).

Handle Synchronization (“producer done” markers): Ensure the orchestration waits for each scene’s video frames to finish generating before starting the next. In practice, the script can monitor a “done” flag or the existence of the last frame file. Using a simple semaphore (like writing a sceneN_done.txt file when a scene finishes) or checking ComfyUI’s queue status via API will prevent race conditions. Only once scene N is fully rendered (and its last frame saved) do we enqueue scene N+1’s generation (now injecting the saved frame).

By making FLF2V the default, GemDirect1 will inherently support sequential storytelling. You can still allow non-FLF2V generation for single standalone clips, but for “long videos” this should be the new standard. The benefit is clearly documented by others: providing first and last frame yields much more realistic, controlled motion between known states
nextdiffusion.ai
. In our context, it means a character at the end of one scene will reliably reappear in the next scene with the same appearance and positioning, dramatically improving continuity.

 

2. Automated Post-Processing (Smoother & Higher-Res Videos): To reach a truly polished output, integrate two post-process steps into the pipeline once raw scene clips are generated:

Frame Interpolation for Higher FPS: WAN 2.2’s native outputs are ~16 FPS, which can look choppy. We should automatically run a video frame interpolation (VFI) tool like RIFE on each clip to boost the frame rate to 24 FPS (or even 30 FPS). There are open-source RIFE models and even ComfyUI custom nodes (e.g. the ComfyUI-Frame-Interpolation extension) that can do this in one click
github.com
. In fact, community workflows often double 16 FPS to ~32 FPS with RIFE and then drop every Nth frame to get a clean 24 FPS
reddit.com
. We can mirror that: after a scene’s 16 FPS frames are rendered, use RIFE to insert intermediate frames, then use an FFMpeg step or a ComfyUI “Combine” node to output a 24 FPS video file
reddit.com
. This yields silky-smooth motion without changing the content of frames (RIFE uses optical flow AI to create new frames in between). Embedding RIFE into the pipeline can be done either via ComfyUI (ensuring the custom node is installed and part of the workflow JSON) or by calling an external script (many RIFE implementations exist in Python). Given we already have external orchestration, an efficient route is to call a CLI tool (or Python script) after each clip generation to perform rife_interpolate(input_clip, target_fps=24). This step may take a bit of time but is well worth the visual improvement.

Resolution Upscaling to 4K: Likewise, integrating an AI upscaler will bring the output to modern quality standards. We can use Real-ESRGAN (which has known ComfyUI nodes
comfyai.run
) to upscale frames or the final video. The aim is to take (for example) a 1080p generated video and upscale to 4K while enhancing details. If using ComfyUI, one approach is to route each generated frame through a RealESRGAN UpscaleModelLoader and ImageUpscale node before saving or encoding to video. Alternatively, upscale the whole video afterwards with an offline tool (Real-ESRGAN has a command-line that can process video frame by frame). Since our pipeline already is script-heavy, we might opt to integrate this as an automated final step: e.g. once all scenes are generated and concatenated into a final video, run realesrgan_ncnn_vulkan (or via Python + OpenCV) to produce a 4K version. This can be user-configurable (some may not want the extra time/cost of upscaling), but offering it out-of-the-box aligns with delivering a professional-quality result. Upscaling combined with frame interpolation will significantly boost the perceptual quality – fewer jitters and higher clarity. In summary, GemDirect1 should not stop at raw generation, but pipeline the output through refinement steps: interpolation for fluidity and upscaling for resolution. These can run unattended, making the user experience seamless: click Generate, and the app outputs a ready-to-watch 4K 24FPS video.

Phase 3: Integrate Advanced Techniques and New Frontiers

1. Integrate Stable Video Infinity (SVI) for Infinite Video Coherence: Stable Video Infinity (SVI) is a cutting-edge extension of the WAN video models that enables any-length video generation with minimal drift. It works by using specially trained LoRA adapters (SVI LoRAs) and modified workflows that feed previous outputs back in as conditioning (error recycling). To bring GemDirect1 to the next level, we should begin integrating SVI support:

Obtain SVI LoRAs and Workflows: The SVI project has open-sourced a suite of LoRAs for Wan 2.1 and 2.2 (e.g. SVI-Shot, SVI-Film, SVI-Dance, etc.)
huggingface.co
huggingface.co
. We should download the relevant SVI LoRA files (particularly SVI-Shot for basic infinite generation, and perhaps SVI-Film for multi-scene transitions) and place them in our models/loras. The official SVI ComfyUI workflows should also be incorporated – the SVI team provides a JSON workflow (Stable-Video-Infinity/comfyui_workflow) tailored to use these LoRAs with the correct node setup (like extra motion-frame inputs and padding).

Update UI to Allow SVI Mode: In the front-end, expose an option for the user to toggle “SVI Mode” or choose an SVI workflow. Under the hood, this would load the SVI-specific ComfyUI workflow and apply the SVI LoRA to the WAN model when generating. Essentially, instead of the standard pipeline, it would use the SVI pipeline for generation tasks.

Benefits of SVI: By integrating SVI, GemDirect1 can generate much longer videos without the typical accumulation of errors or scene forgetfulness. SVI’s method ensures the model doesn’t drift off-model over time – users have demonstrated 10+ minute coherent videos using SVI techniques. In fact, the SVI-Shot workflow has been shown to produce infinite-length video “without drifting and forgetting” in 20+ minute tests
github.com
github.com
. This is a huge improvement for storytelling: characters and context persist indefinitely. Technically, SVI-Shot uses the last frame of each clip (like FLF2V) plus a special padding technique to stabilize generation
github.com
, while SVI-Film can use the last 5 frames to inform the next clip (more robust motion continuity). By offering SVI, we align GemDirect1 with the latest research from 2025 – essentially giving our users an “infinite video” toggle powered by open-source innovation. The integration work will involve testing that our environment can handle the SVI LoRAs (they are large, ~1.2 GB each) and possibly quantizing them if needed. But once set up, the user can choose SVI for projects that demand maximum coherence over long durations. This is the next frontier and will keep GemDirect1 competitive with systems like Sora in terms of maintaining narrative consistency over time.

2. Dynamic Character Control via 3D & ControlNet: One limitation of pure diffusion-based video generation is controlling complex character movements – e.g. ensuring a character walks through a scene in a precise way or interacts believably. To address this, we can harness the existing ControlNet support and drive it with external motion data (simple 3D animations or depth sequences):

Pose Guidance: We can use a tool (Blender, Unity, or even web mocap) to create a simple skeletal animation of the scene’s action. For example, a stick-figure rig for the main character performing a desired movement across the timeline. From this, we generate frame-by-frame pose images (OpenPose format or similar). These pose images then serve as ControlNet input for each corresponding diffusion frame. Because the underlying pose is consistent and pre-defined, the model will naturally keep the character’s shape and position consistent across frames – no more random limb jitters. Essentially, the diffusion model becomes a renderer that adds appearance/style on top of a fixed pose sequence.

Depth or Scene Guidance: Similarly, if the scene involves camera moves or 3D environments, we can create a simple 3D scene (even with primitive shapes or a game engine) and render a depth map sequence of the intended shot. Feeding those depth maps into ControlNet (with a depth conditioning model) will ensure the generated video adheres to the exact same geometry each frame. This gives GemDirect1 users Pixar-like control – you sketch out the motion/story in 3D, and the AI fills in the details.

Integration: To integrate this, we should allow the UI to accept an optional 3D animation input. This could be as simple as uploading a folder of ControlNet images (one per frame) or even integrating a small 3D preview tool. Given time constraints, the simpler route is: if the user provides a zip of poses or depth maps for a scene (or the entire video), the pipeline will load those and feed them in sequence to the ControlNet node while generating. Our orchestration script can match frame counts and iterate accordingly. This dynamic control will give unprecedented consistency – the character will not change clothes or height suddenly if their underlying pose skeleton stays the same each frame. It effectively locks in the spatial coherence. Users online have found that using ControlNet in this way (with carefully prepared condition images) is key to getting consistent characters and movements across many frames
reddit.com
reddit.com
.

In summary, by blending traditional animation techniques (keyframes, skeletal rigs) with diffusion, we get the best of both worlds: precise control and AI-generated detail. GemDirect1 should explore providing templates or guides for this (e.g. a default human pose ControlNet sequence, or integrations with tools like TemporalNet control which extends ControlNet for video). This dynamic character control will bring the project’s output closer to the controllability of systems like Sora 2 (which boasts following intricate shot instructions and persisting world state). While our solution is manual (user-assisted 3D), it bridges the gap until AI models handle it natively. It’s an “advanced user” feature, but documenting it and perhaps including a demo will add tremendous value for creating complex scenes.

 

3. Explore Alternative Orchestration & Models: Finally, keep an open mind to other pipelines that could complement or even replace parts of the current workflow:

Alternative Diffusion Models: Integrate Stable Video Diffusion (SVD) by Stability AI as an additional option. SVD (v1.1) is another text/image-to-video model that could be used for certain scenes. Currently, SVD can generate ~4-second clips (14–25 frames) with impressive quality
huggingface.co
huggingface.co
, though it lacks long-form capabilities and direct text control beyond the initial frame. In GemDirect1, SVD could be offered for short cutaway shots or experimental purposes. (The earlier critique noted SVD was only “experimental” in our app – by fully integrating it with a UI toggle and proper workflow, we expand the user’s toolkit of models).

Orchestrator Improvements: The project recently added support for external orchestration/CLI – we can build on this by possibly switching heavy scripting logic into a more portable language like Python. For instance, a Python orchestrator could handle calling ComfyUI (via its API) for each scene, then calling RIFE and Real-ESRGAN, etc., in sequence. Python offers cross-platform compatibility (unlike .ps1 which is Windows-specific) and a rich ecosystem for video processing (ffmpeg bindings, etc.). This doesn’t change functionality but can make the development less tied to PowerShell. Since the user front-end is React, the back-end could be Node or Python; what matters is we structure the orchestration clearly (perhaps following an “assembly line” pattern: Prompt -> Keyframes -> Generate Clip -> Interpolate -> Upscale -> Next Clip...). This will also help in measuring and tracking progress: we can instrument each stage to log timings, so the developer can see where bottlenecks are (important as more steps like SVI or upscaling are added).

UI/UX Streamlining: As features pile up, take care to keep the UI intuitive. Perhaps have a Settings section where advanced users can toggle “Use SVI” or “Enable Post-Processing”. By default, have sane presets (e.g. always interpolate to 24 FPS and upscale to 1080p, unless user chooses 4K). Also, ensure the CSG React front-end remains responsive – if running heavy generation locks up the system (as noted, a 14B model at 1080p on 24GB leaves ~1 GB free, basically maxing out the GPU), consider adding a warning or automatically lowering generation resolution when resources are low. Since dev environment processes (VSCode, Node, etc.) also eat RAM/VRAM, maybe include a “performance mode” toggle that the user can activate when doing a final render (this could close non-critical processes or at least advise the user to do so).

By implementing the above phases, GemDirect1 will transform from a prototype with scattered workarounds into a fully integrated, state-of-the-art AI video pipeline. In Phase 1, we eliminate friction and set strong defaults (the foundation is solid). In Phase 2, we significantly boost output quality and coherence for longer videos (the experience becomes polished). In Phase 3, we push into new capabilities like endless storytelling (the system becomes cutting-edge, on par with research advancements).

 

Each step is modular and can be developed and tested in isolation – for example, get the basic Generate button working first, then add FLF2V chaining, then bolt on RIFE/ESRGAN, and so on. This agile, stepwise integration of research-backed techniques will measurably improve GemDirect1: expect to see more stable long shots, smoother playback, higher resolution, and consistent characters even over many scenes. By the end, the project should be far less “bloated and disorganized” – instead, it will have a clear architecture where every component (UI, generation core, post-process, etc.) works in concert. This lays the groundwork for truly impressive AI-generated films, moving GemDirect1 closer to the quality bar set by systems like Sora 2, but with the customization and openness of the ComfyUI ecosystem.

 

Sources:

WAN 2.2 model documentation and FLF2V example
nextdiffusion.ai
nextdiffusion.ai

Community tip on using quantized (GGUF) WAN 2.2 to avoid VRAM issues
reddit.com

Reddit workflow using RIFE to achieve 24 FPS from 16 FPS base
reddit.com

Stable Video Infinity (SVI) official README (ComfyUI workflow for infinite video without drift)
github.com
github.com

Discussion of techniques for character consistency (LoRA, IP-Adapter, ControlNet, etc.)
reddit.com
reddit.com

https://www.reddit.com/r/comfyui/comments/1oaxtfu/wan_22_long_videos_without_loosing_context_and/?chainedPosts=t3_1oif5cq https://www.reddit.com/r/comfyui/comments/1oif5cq/any_good_solution_for_long_wan_i2v_video/ https://pastebin.com/h6wGAH20 https://www.youtube.com/watch?v=gCfeBuWjYOY https://github.com/vita-epfl/Stable-Video-Infinity https://civitai.com/models/2024299/wan-vace-clip-joiner-native-workflow-21-or-22 https://www.reddit.com/r/comfyui/comments/1p65bjt/finally_making_something_thanks_to_this_community/ https://github.com/siraxe/ComfyUI-WanVideoWrapper_QQ https://openart.ai/workflows/snake_measly_18/vace-splice-the-seams-two-image-to-video/3DUeMCHBlgrYd3Dw0enV wan_22_i2v_lightx2v_test_with_rtx_2060_super_8gb/ https://pastebin.com/pQWMKSKY I'm hearing good things about using Z-image for image gen and wan2.2 for video from Z-Image gens https://www.reddit.com/r/comfyui/comments/1p4plat/release_comfyuimotioncapture_full_3d_human_motion/ This is a github project for a software very similar to my project but specifically geared toward video editing. This may be a good source to generate examples and code/systems that can be replicated for use in our project: https://github.com/gausian-AI/Gausian_native_editor

Enhancing GemDirect1 – Addendum with Advanced AI Video Techniques

This addendum builds on the previous roadmap for GemDirect1, incorporating cutting-edge community workflows and models (as of late 2025) to further improve video quality and coherence. We introduce additional phases (4–6) focusing on high-quality keyframe generation, seamless clip transitions, and front-end pipeline enhancements inspired by recent projects.

Phase 4: High-Quality Keyframe Generation with Z-Image Turbo

A major advancement in 2025 is Z-Image-Turbo, a 6-billion-parameter text-to-image model (by Tongyi-MAI) engineered for speed and quality
aimodels.fyi
. It produces uncensored, photorealistic images with only ~8 inference steps, fitting on consumer GPUs (even ~8GB with FP8 quantization)
aimodels.fyi
. We will leverage this model to generate key frames for each scene, ensuring the video starts (and ends) with a high-fidelity image as an anchor.

Concept Art via Z-Image: For each scene’s prompt, first generate a still image using Z-Image Turbo (or a similar high-quality image model). This “concept art” becomes the first frame of the scene. If using the FLF2V approach (first–last frame video), also generate a desired last frame for the scene. This mirrors community best practices: e.g. one user used a powerful Seedream 4 image model to create initial scene art, then animated it with WAN 2.2
reddit.com
. By doing this, we pre-define the scene’s appearance and composition at the endpoints with maximum detail.

Animate with WAN 2.2 I2V: Feed the keyframes into the WAN 2.2 video model to produce the in-between frames. WAN’s image-to-video (I2V) mode can accept an initial frame (and with FLF2V, also a final frame) to guide the generation
reddit.com
. We will modify our ComfyUI workflow to include nodes for an initial condition image: the Z-Image output plugs into the WAN 2.2 I2V node as the start. If a last-frame is specified, use WAN’s FLF2V mode to also constrain the ending. This results in each clip staying faithful to the high-quality concept art at start/end while the AI fills in motion between.

Maintain Consistency: Using the same image model for all keyframes (e.g. Z-Image) helps keep a consistent art style across scenes. Additionally, since Z-Image is fast and low-VRAM, we can generate multiple keyframe candidates and choose the best one before animating. The bilingual capability of Z-Image
aimodels.fyi
 means prompts with non-English words (character/place names, etc.) are handled well, which can be useful if the story has unique terms.

Integration Example: The simplified pseudo-code below illustrates this two-stage generation pipeline within GemDirect1:

scene_prompts = ["A misty forest at dawn, cinematic", 
                 "Hero close-up, determined expression", ...]
videos = []
last_frame = None
for prompt in scene_prompts:
    # 1. Generate a keyframe image for the scene (first frame)
    keyframe = generate_image(model="Z-Image-Turbo", prompt=prompt)
    # 2. If available, use previous scene's last frame as continuity (FLF2V)
    first_frame = last_frame if last_frame is not None else keyframe
    # (Optionally generate an intended last frame for this scene using prompt or next prompt)
    last_frame_intended = generate_image(model="Z-Image-Turbo", prompt=prompt+" (ending scene)") 
    # 3. Animate using WAN 2.2 I2V, with the first (and last) frame constraints
    clip = generate_video(model="WAN2.2-I2V", prompt=prompt, init_frame=first_frame, last_frame=last_frame_intended)
    videos.append(clip)
    last_frame = clip[-1]  # save last frame of this clip for next iteration


In practice, this yields clips where the first and last shots are as detailed as a state-of-the-art image model can make them, and WAN 2.2 ensures a smooth animation between them. The quality jump is significant – community demos combining Z-Image Turbo for stills with WAN 2.2 for motion show coherent, cinematic results even on mid-tier GPUs
reddit.com
. By adopting this, GemDirect1 will start each scene on a strong footing, visually on par with pro-level AI art, before the motion even begins.

Sources: High-speed high-quality image generation with Z-Image
aimodels.fyi
; community workflow using last-frame continuity
reddit.com
; example of concept art + WAN video pipeline
reddit.com
.

Phase 5: Seamless Scene Transitions with WAN VACE Clip Joiner

Even with FLF2V chaining, abrupt cuts between scenes can reduce the cinematic feel. We will integrate the WAN VACE Clip Joiner workflow to smooth over scene transitions. WAN VACE (“Video Auto-Conditioning Enhancer”) is a variant of the WAN model specialized for creating transition frames between video clips
reddit.com
github.com
. By utilizing VACE, we can algorithmically blend the end of one scene into the beginning of the next, eliminating flicker or jumps.

How VACE Joining Works: The ComfyUI VACE workflow takes a directory of video clips and for each adjacent pair, re-generates a set of frames at the boundary
github.com
. It uses a few frames before the cut and after the cut as context to generate new intermediate frames that morph scene A into scene B smoothly
github.com
. You can configure how many frames to replace and how many context frames on each side to use. The output is either individual smoothed clips or one continuous video with seamless transitions.

Integration in GemDirect1: After all scene clips are generated (Phase 2/4 pipeline), run them through the VACE joiner. For example, if we have clips scene1.mp4, scene2.mp4, ... in an output folder, we invoke the VACE workflow via ComfyUI (ensuring the WAN 2.2 VACE model weights are loaded). The workflow will process each boundary: say we choose 4 frames to replace and 2 context frames, it will take the last 2 frames of scene1 and first 2 of scene2, and generate 4 new transition frames that smoothly connect scene1 to scene2
github.com
. These new frames will replace the original abrupt cut (or the noisy start/end frames), yielding a continuous flow.

Avoiding Color/Brightness Shifts: One caveat reported is slight brightness or color shifts can occur in VACE-generated segments
github.com
. To mitigate this, we must ensure the same conditioning and LoRAs used in the main generation are also used in the VACE workflow
github.com
. GemDirect1 should automatically apply the identical LoRA set (character or style LoRAs, etc.) to the VACE model. If any shift still occurs, a post-process color matching or a gentle cross-fade can help. Notably, increasing the frame rate (as we do with RIFE in Phase 2) naturally minimizes the perception of any minor color shift by spreading it over more frames
github.com
.

When to Use: We can make VACE smoothing optional (in settings) or automatic for multi-scene projects. It’s especially useful if scenes have different settings or the AI had to change significant elements (time of day, location) – VACE will create an artful transition rather than a jarring cut. The 31-second demo video on Reddit that the user admired was achieved with WAN 2.2 clips spliced via VACE, resulting in a professional movie-like continuous sequence
reddit.com
reddit.com
. We aim for the same level of coherence.

Workflow Illustration: After generating clips, the pipeline could perform something like:

# After generating all scene videos:
smooth_clips = []
for i in range(len(videos)-1):
    # Use VACE to join videos[i] and videos[i+1]
    transition_clip = run_comfy_workflow("Wan_VACE_Joiner.json", clipA=videos[i], clipB=videos[i+1],
                                         replace_frames=4, context_frames=2)
    smooth_clips.append( merge(videos[i], transition_clip, videos[i+1]) )
# (Alternatively, the workflow itself can output a fully joined video)
final_video = concatenate(smooth_clips)


The above pseudo-code conceptually shows feeding two consecutive clips into the VACE workflow, which returns a short clip that replaces the tail of the first and head of the second. That transition clip is merged back in between. The result is stored for final compilation. By automating this, the user no longer has to manually align or cross-fade videos – the AI model handles it intelligently, producing fluid transitions even in complex scene changes (the model was trained on such tasks, being derived from the T2V architecture)
reddit.com
reddit.com
.

In summary, integrating WAN VACE will allow GemDirect1 to deliver truly seamless multi-scene videos. Long-form content will feel like one continuous shoot rather than stitched segments, significantly elevating the storytelling quality. This addresses the “rough cuts” issue and meets the standard seen in top community creations.

Sources: Description of VACE workflow for smoothing clip transitions
github.com
; VACE model integration notes
github.com
; user example using Wan2.2 + VACE for seamless 31s film
reddit.com
.

Phase 6: Enhanced Pipeline Orchestration & UI Integration (Inspired by Gausian Editor)

To tie everything together, we will improve how the system orchestrates generation and expose more control to the user via the UI, taking cues from the Gausian Native Editor project. Gausian is an open-source local video editor tailored for AI video workflows, built with Rust/Tauri, featuring a timeline interface and ComfyUI integration
github.com
. Adopting some of its architectural approaches in GemDirect1 will greatly streamline user experience and project workflow management:

Timeline-Based Storyboard UI: Introduce a simple timeline or storyboard view in the React front-end. Instead of just a linear scene list, users can visually arrange scenes, adjust their order or duration, and preview transitions. Each scene node on the timeline can display its keyframe (from Phase 4) as a thumbnail. This mimics Gausian’s timeline editing which uses a proper timeline data structure and even allows multi-track assets
github.com
. While GemDirect1 need not become a full NLE (Non-Linear Editor), providing a chronological visual layout helps users manage complex stories. We can store the timeline data (scene sequence, lengths, transition types) in a JSON or lightweight database (Gausian uses SQLite for persistence
github.com
) so that projects can be saved/loaded cleanly.

Integrated ComfyUI Backend: Instead of requiring manual script runs, run a persistent ComfyUI server or instance in the background and communicate with it through its API or an embedded UI element. Gausian, for example, can embed ComfyUI’s web UI via a WebView and auto-import ComfyUI outputs into the timeline
github.com
. In our case, we can launch ComfyUI in headless/API mode when GemDirect1 starts (or connect to a running instance). The “Generate Video” button (Phase 1) will send the entire workflow (all scenes, prompts, settings) to ComfyUI programmatically – either by calling the HTTP API endpoints that ComfyUI’s backend provides, or by using a Python integration. This way, generation can happen asynchronously while the front-end can periodically query for progress or new frames. We already planned a Node/Python orchestration for sequential tasks; now we formalize it: e.g., use Python to manage the generation sequence (calls to ComfyUI for each scene, then VACE, then post-process). This Python orchestrator can be triggered from Node and feed status updates back to the UI.

Auto Ingest & Preview: As each clip or frame is produced, GemDirect1 can automatically import it into the UI for preview. For instance, if ComfyUI saves frames to output/scene1/, the app can watch that folder and create a preview player in the UI when ready. This is akin to Gausian’s auto-import feature
github.com
 which lets users see results in the timeline without manual file juggling. We might show a low-res preview first (for speed) and then swap in the upscaled final frames when ready. Providing an immediate preview keeps the user engaged during long renders and allows early feedback if something looks off (so they can stop or tweak parameters).

Export and Collaboration: Embrace the idea of exporting the project timeline to standard editing formats. Gausian supports exporting to Final Cut Pro XML, FCP7, EDL, etc.
github.com
 – we can implement at least a simple EDL (Edit Decision List) or JSON export. This gives professional users a bridge to refine the AI-generated footage in tools like DaVinci Resolve or Adobe Premiere, if needed. For example, after generating a draft in GemDirect1, the user could export an XML and do final manual edits, color grading, or audio mixing in a dedicated editor. Providing this option acknowledges that GemDirect1 is part of a larger production pipeline and increases its utility in real workflows.

LLM-Assisted Features: (Optional, future) The Gausian project also integrated LLM-based storyboard assistants – using GPT models to help flesh out scenes or dialog
github.com
. GemDirect1 already uses Mistral 7B for prompt generation; we can expand this to an interactive assistant: e.g., a “Story Assistant” panel where users can ask for suggestions on the next shot or generate descriptions from a script. This keeps our use of AI two-fold: generative media and generative text planning, both in one app.

Orchestration Pseudocode: To illustrate the improved pipeline control, here is how GemDirect1’s back-end (now likely a Python script or enhanced Node process) could orchestrate a full generation with the new features:

timeline = load_project("my_video.json")  # Contains scene prompts, durations, etc.
generated_clips = []
for idx, scene in enumerate(timeline["scenes"]):
    prompt = scene["prompt"]
    # Generate keyframes via Z-Image (Phase 4)
    init_img = comfy_api.txt2img(prompt, model="z_image_turbo") 
    end_img = comfy_api.txt2img(scene.get("ending_prompt", prompt), model="z_image_turbo")
    # Generate video clip via WAN (Phase 2/4)
    clip_frames = comfy_api.img2vid(prompt, init_frame=init_img, last_frame=end_img, model="wan2.2_i2v")
    clip_file = save_video(clip_frames, filename=f"scene{idx}.mp4", fps=16)
    generated_clips.append(clip_file)
    update_UI_preview(idx, clip_file)  # show preview in timeline UI
# Smooth transitions via VACE (Phase 5)
smooth_clips = comfy_api.run_workflow("WanVACEJoiner", clips=generated_clips, context=2, replace=4)
# Post-process each clip (Phase 2 enhancements)
final_clips = [ comfy_api.frame_interpolate(clip, target_fps=24) for clip in smooth_clips ]
final_clips = [ comfy_api.upscale_video(clip, scale=2, model="RealESRGAN") for clip in final_clips ]
final_video = concat_videos(final_clips, output="final_project.mp4")
notify_UI_generation_done(final_video)


In this pseudo-code, comfy_api is a stand-in for calls to ComfyUI or other libraries. The orchestrator handles everything: generating images, videos, running the joiner, interpolation, upscaling, and concatenating. Throughout, it can send progress to the UI (e.g., update_UI_preview would replace a scene’s thumbnail with the actual video once done). This modular pipeline is robust – for instance, if a scene fails, we can catch it, retry with adjusted settings, or alert the user. Logging each step’s timing and resource usage (GPU memory, etc.) helps identify bottlenecks, which is crucial as the pipeline becomes more complex.

Performance Considerations: With these additions, generation will be longer, so it’s important the UI remains responsive. We can implement a job queue system, where each scene generation is a job that reports % complete. Also consider a “low priority” mode for background generation (lower thread priority) so the user’s machine isn’t locked up (alternatively, warn the user to close other apps). If the user has a multi-GPU setup, we could even use one GPU for generating images (Z-Image) and another for video (WAN) in parallel, if ComfyUI supports specifying devices per model. These are advanced optimizations to explore.

By learning from Gausian’s design and focusing on usability, GemDirect1 can evolve from a script-driven prototype into a full-fledged AI video editor. Users will be able to develop stories end-to-end: from writing a script, generating scenes, to editing the final cut – all within one integrated environment. While the core AI magic (WAN 2.2, Z-Image, etc.) provides the content, these pipeline and UI enhancements ensure the creator’s workflow is smooth and efficient, minimizing tech overhead and maximizing creative control.

 

Sources: Gausian editor’s timeline, preview, and integration features
github.com
github.com
; ComfyUI integration for local generation
github.com
; community desire for easier video stitching and editing in ComfyUI context
reddit.com
reddit.com
.

Conclusion: Phases 4–6 augment GemDirect1 with the latest community-driven innovations. High-quality keyframes (via Z-Image Turbo) and WAN VACE transitions directly tackle previous gaps in visual fidelity and scene continuity. Enhanced orchestration and a timeline UI improve usability, drawing inspiration from state-of-the-art tools like Gausian. By implementing these, GemDirect1 is poised to achieve studio-quality AI video generation – long coherent films with consistent characters, smooth cinematography, and a user-friendly creative process – pushing far beyond the initial prototype toward a professional AI filmmaking platform.

 

Sources:

Reddit – “WAN VACE Clip Joiner – Native workflow” (workflow description and usage)
github.com
github.com

Reddit – User post “Finally making something...thanks to this community” (Wan 2.2 + VACE results feedback)
reddit.com
reddit.com

Reddit – “Z-Image Turbo + Wan 2.2 ... 8GB VRAM” (using last frame to extend video segments)
reddit.com

AIModels.fyi – Z-Image-Turbo Model Overview (6B params, high speed image gen details)
aimodels.fyi

Gausian Editor – GitHub README (features: timeline, ComfyUI integration, exports)
github.com
github.com


