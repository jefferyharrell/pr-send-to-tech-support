// UXP-compatible: Gather and display diagnostic info, copy to clipboard, export as .txt

let latestDiagnosticInfo = '';

async function getPremiereData() {
  let version = 'Unknown';
  let projectName = 'Unknown';
  let sequenceName = 'Unknown';
  let sequenceSettings = 'Unknown';
  let mediaTypes = 'Unknown';
  let formats = 'Unknown';

  // Try to get version from userAgent
  if (navigator.userAgent) {
    const match = navigator.userAgent.match(/Premiere Pro \(Beta\)\/(\d+\.\d+\.\d+)/);
    if (match) version = match[1];
  }

  try {
    const ppro = require('premierepro');
    const project = await ppro.Project.getActiveProject();
    if (project) {
      projectName = project.name || 'Unknown';
      const sequence = await project.getActiveSequence();
      if (sequence) {
        sequenceName = sequence.name || 'Unknown';
        // Get frame size
        let width = 'Unknown';
        let height = 'Unknown';
        let frameRate = 'Unknown';
        try {
          const frameSize = await sequence.getFrameSize();
          if (frameSize) {
            width = frameSize.width || 'Unknown';
            height = frameSize.height || 'Unknown';
          }
        } catch (e) {}
        // Try to get frameRate from ProjectItem first
        try {
          const projectItem = await sequence.getProjectItem();
          if (projectItem && typeof projectItem.frameRate === 'number') {
            frameRate = projectItem.frameRate.toFixed(3);
          }
        } catch (e) {}
        // Fallback to timebase/ticks logic if needed
        if (frameRate === 'Unknown') {
          try {
            const timebase = await sequence.getTimebase();
            if (typeof timebase === 'number') {
              if (timebase > 1000) {
                // Ticks per frame, convert to fps
                frameRate = (254016000000 / timebase).toFixed(3);
              } else {
                // Already a frame rate
                frameRate = timebase.toFixed(3);
              }
            } else if (timebase && typeof timebase.seconds === 'number') {
              frameRate = (1 / timebase.seconds).toFixed(3);
            } else if (typeof timebase === 'string') {
              const ticks = Number(timebase);
              if (!isNaN(ticks) && ticks > 1000) {
                frameRate = (254016000000 / ticks).toFixed(3);
              } else if (!isNaN(ticks)) {
                frameRate = ticks.toFixed(3);
              } else {
                frameRate = timebase;
              }
            }
          } catch (e) {}
        }
        sequenceSettings = `${frameRate}fps, ${width}x${height}`;
        mediaTypes = await getMediaTypesFromSequence(sequence);
        formats = await getFormatsFromProject(project);
      }
    }
  } catch (e) {
    // Fallbacks already set
  }

  return { version, projectName, sequenceName, sequenceSettings, mediaTypes, formats };
}


// Get system information using available UXP APIs
function getSystemData() {
  let osVersion = 'Unknown';
  let cpu = 'Unknown';
  let gpu = 'Unknown';
  let ram = 'Unknown';
  let storage = 'Unknown';
  
  try {
    const os = require('os');
    let osPlatform = os.platform();
    if (osPlatform === 'darwin') osPlatform = 'macOS';
    else if (osPlatform === 'win32') osPlatform = 'Windows';
    
    // Get OS version
    if (os.version) {
      osVersion = `${osPlatform} ${os.version()}`;
    } else if (os.release) {
      osVersion = `${osPlatform} ${os.release()}`;
    } else {
      osVersion = osPlatform;
    }
    
    // CPU information
    const arch = os.arch();
    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      cpu = `${cpus[0].model} (${cpus.length} cores, ${arch})`;
    } else {
      cpu = `${arch} architecture`;
    }
    
    // Memory information - UXP has limited system access
    try {
      // UXP for Premiere Pro doesn't provide os.totalmem/freemem APIs
      // These are Node.js APIs that aren't available in the UXP runtime
      if (os.totalmem && typeof os.totalmem === 'function') {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        if (totalMem && totalMem > 0) {
          const totalGB = Math.round(totalMem / (1024 * 1024 * 1024));
          const freeGB = Math.round(freeMem / (1024 * 1024 * 1024));
          ram = `${totalGB} GB total, ${freeGB} GB free`;
        } else {
          ram = 'Memory values returned as 0';
        }
      } else {
        ram = 'Memory APIs not available in UXP';
      }
    } catch (memError) {
      ram = 'Memory information not accessible';
    }
    
    // GPU detection - UXP doesn't provide GPU APIs for Premiere, so detect based on platform
    if (osPlatform === 'macOS') {
      // Try to detect Apple Silicon vs Intel
      if (arch === 'arm64') {
        gpu = 'Apple Silicon GPU';
      } else {
        gpu = 'macOS GPU (Intel-based)';
      }
    } else if (osPlatform === 'Windows') {
      gpu = 'Windows GPU (detected via platform)';
    } else {
      gpu = 'GPU information not available';
    }
    
    // Storage information - UXP doesn't provide direct storage APIs
    storage = 'Storage information not available in UXP';
    
  } catch (e) {
    // Fallback to userAgent parsing
    if (navigator.userAgent.indexOf('Macintosh') !== -1) {
      osVersion = 'macOS (detected via userAgent)';
      if (navigator.userAgent.indexOf('Intel') !== -1) {
        cpu = 'Intel processor (detected via userAgent)';
        gpu = 'macOS GPU (Intel-based)';
      } else {
        cpu = 'Apple Silicon processor (detected via userAgent)';
        gpu = 'Apple Silicon GPU';
      }
    } else if (navigator.userAgent.indexOf('Windows') !== -1) {
      osVersion = 'Windows (detected via userAgent)';
      cpu = 'Windows processor (detected via userAgent)';
      gpu = 'Windows GPU (detected via userAgent)';
    }
    
    // Try to parse more specific OS version from userAgent
    const match = navigator.userAgent.match(/(Mac OS X|Windows NT) ([\d_\.]+)/);
    if (match && match[2]) {
      const version = match[2].replace(/_/g, '.');
      if (match[1] === 'Mac OS X') {
        osVersion = `macOS ${version}`;
      } else {
        osVersion = `Windows ${version}`;
      }
    }
  }
  
  return {
    osVersion,
    cpu,
    gpu,
    ram,
    storage
  };
}

async function getDiagnosticInfo() {
  const premiere = await getPremiereData();
  const system = getSystemData();
  
  return (
    `Premiere Version: ${premiere.version}  \n` +
    `Project Name: ${premiere.projectName}  \n` +
    `Sequence Name: ${premiere.sequenceName}  \n` +
    `OS: ${system.osVersion}  \n` +
    `CPU: ${system.cpu}  \n` +
    `GPU: ${system.gpu}  \n` +
    `RAM: ${system.ram}  \n` +
    `Storage: ${system.storage}  \n` +
    `\n` +
    `Sequence Settings: ${premiere.sequenceSettings}  \n` +
    `\n` +
    `Media Types: ${premiere.mediaTypes}  \n` +
    `Formats: ${premiere.formats}  `
  );
}


async function updateOutput() {
  const info = await getDiagnosticInfo();
  latestDiagnosticInfo = info;
  document.getElementById('output-area').textContent = info;
}


// Helper to get all info as plain text (for clipboard)
function getAllPanelInfoText() {
  const text = latestDiagnosticInfo || '';
  // Place guidance template at the top for clipboard
  const guidance = 'Issue: (A short description of the problem)\nSteps to Reproduce: (A numbered list of the exact steps needed to hit this issue.)\nExpected Result: (What should happen.)\nActual Result: (What does happen.)';
  return guidance + '\n\n' + text.trim();
}

async function copyToClipboard() {
  const button = document.getElementById('copy-btn');
  const originalText = button.textContent;
  
  try {
    // Combine both diagnostic info and detailed info
    const text = getAllPanelInfoText();
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    
    // Show success feedback
    button.textContent = 'Copied! ✓';
    button.style.backgroundColor = '#28a745';
    
    // Reset button after 2 seconds
    setTimeout(() => {
      button.textContent = originalText;
      button.style.backgroundColor = '#0094ff';
    }, 2000);
    
  } catch (error) {
    // Show error feedback
    button.textContent = 'Copy Failed';
    button.style.backgroundColor = '#dc3545';
    
    // Reset button after 2 seconds
    setTimeout(() => {
      button.textContent = originalText;
      button.style.backgroundColor = '#0094ff';
    }, 2000);
    
    console.error('Failed to copy to clipboard:', error);
  }
}

// Show info on load
updateOutput();

document.getElementById('copy-btn').addEventListener('click', async () => {
  await copyToClipboard();
  await updateOutput();
});


// Note: Initialization now handled in DOMContentLoaded event above

// Helper to get formats from all media in the project
async function getFormatsFromProject(project) {
  const formats = new Set();
  async function traverse(item) {
    if (item.type === 'BIN' || item.type === 'ROOT') {
      if (item.getItems) {
        const children = await item.getItems();
        if (Array.isArray(children)) {
          for (const child of children) {
            await traverse(child);
          }
        }
      }
    } else if (item.type === 'CLIP' || item.type === 'FILE') {
      if (item.getMediaPath) {
        const path = await item.getMediaPath();
        if (path && path.includes('.')) {
          const ext = path.split('.').pop().toLowerCase();
          formats.add(ext);
        }
      }
    }
  }
  const rootItem = await project.getRootItem();
  await traverse(rootItem);
  return Array.from(formats).join(', ') || 'Unknown';
}


// Note: DOMContentLoaded initialization moved to earlier in file


// Helper to get media types from sequence
async function getMediaTypesFromSequence(sequence) {
  const mediaTypes = new Set();

  // Video tracks
  if (sequence.getVideoTracks) {
    try {
      const videoTracks = await sequence.getVideoTracks();
      for (const track of videoTracks) {
        if (track.getClips) {
          const clips = await track.getClips();
          for (const clip of clips) {
            if (clip.getProjectItem) {
              const projectItem = await clip.getProjectItem();
              if (projectItem && projectItem.getFootageInterpretation) {
                try {
                  const interp = await projectItem.getFootageInterpretation();
                  if (interp) {
                    if (interp.codec) {
                      mediaTypes.add(interp.codec);
                    }
                    if (interp.format) {
                      mediaTypes.add(interp.format);
                    }
                    if (interp.fileType) {
                      mediaTypes.add(interp.fileType);
                    }
                    if (interp.description) {
                      mediaTypes.add(interp.description);
                    }
                  }
                } catch (e) {
                  console.error('Error in getFootageInterpretation:', e);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error in codec extraction:', e);
    }
  }

  // Audio tracks
  if (sequence.getAudioTracks) {
    try {
      const audioTracks = await sequence.getAudioTracks();
      for (const track of audioTracks) {
        if (track.getClips) {
          const clips = await track.getClips();
          for (const clip of clips) {
            if (clip.type === 2) mediaTypes.add('Audio');
          }
        }
      }
    } catch (e) {
      console.error('Error in audioTracks:', e);
    }
  }

  return Array.from(mediaTypes).join(', ') || 'Unknown';
}

// Helper to robustly calculate and format frame rate in fps
async function getSequenceFrameRate(sequence) {
  let frameRate = 'Unknown';
  // Try to get frameRate from ProjectItem first
  try {
    if (sequence.getProjectItem) {
      const projectItem = await sequence.getProjectItem();
      if (projectItem && typeof projectItem.frameRate === 'number') {
        frameRate = projectItem.frameRate.toFixed(3);
        return frameRate + ' fps';
      }
    }
  } catch (e) {}
  // Fallback to timebase/ticks logic if needed
  try {
    if (sequence.getTimebase) {
      const timebase = await sequence.getTimebase();
      if (typeof timebase === 'number') {
        if (timebase > 1000) {
          // Ticks per frame, convert to fps
          frameRate = (254016000000 / timebase).toFixed(3);
        } else {
          // Already a frame rate
          frameRate = timebase.toFixed(3);
        }
        return frameRate + ' fps';
      } else if (timebase && typeof timebase.seconds === 'number') {
        frameRate = (1 / timebase.seconds).toFixed(3);
        return frameRate + ' fps';
      } else if (typeof timebase === 'string') {
        const ticks = Number(timebase);
        if (!isNaN(ticks) && ticks > 1000) {
          frameRate = (254016000000 / ticks).toFixed(3);
        } else if (!isNaN(ticks)) {
          frameRate = ticks.toFixed(3);
        } else {
          frameRate = timebase;
        }
        return frameRate + ' fps';
      }
    }
  } catch (e) {}
  return frameRate;
} 