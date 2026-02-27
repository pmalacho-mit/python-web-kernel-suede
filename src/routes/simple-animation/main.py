import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter


def main() -> None:
    x = np.linspace(0, 2 * np.pi, 400)

    fig, ax = plt.subplots(figsize=(6, 4))
    (line,) = ax.plot(x, np.sin(x), lw=2)
    ax.set_xlim(0, 2 * np.pi)
    ax.set_ylim(-1.2, 1.2)
    ax.set_title("Simple Sine Wave Animation")
    ax.set_xlabel("x")
    ax.set_ylabel("sin(x + phase)")

    def update(frame: int):
        phase = frame * 0.1
        line.set_ydata(np.sin(x + phase))
        return (line,)

    animation = FuncAnimation(
        fig,
        update,
        frames=30,
        interval=50,
        blit=True,
    )

    writer = PillowWriter(fps=30)
    output_file = "simple_animation.gif"
    animation.save(output_file, writer=writer)
    
    print(f"Saved animation to {output_file}")


if __name__ == "__main__":
    main()
