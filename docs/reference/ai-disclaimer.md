# AI Usage & Development Transparency

> **A note from the developer**
>
> Hi, I'm [Snozxyx](https://github.com/snozxyx), the developer behind [Tatakai](https://github.com/snozxyx/Tatakai). I want to be transparent about how this project was made, what I worked on, and where AI fits into the development process.

Tatakai is a free, open-source project I started to explore an idea, improve my skills, and build something useful for the anime and manga community. **Yes, I used AI to help write code—particularly for the frontend.** But that is not the whole development story.

## Frequently asked questions

### Was AI used to build Tatakai?

**Yes.** AI coding tools were used extensively to help implement the frontend, translate designs into components, and speed up iteration. I am not hiding that or presenting every line of generated code as handwritten.

At the same time, using AI to generate code does not mean the application appeared from a single prompt. I still had to define what to build, how the pieces should work together, and how to identify and fix problems.

### Is Tatakai open source?

**Yes.** The source code is available at [github.com/Snozxyx/Tatakai](https://github.com/Snozxyx/Tatakai).

You are welcome to inspect the implementation, raise issues, suggest improvements, or contribute. You do not have to take my description of the development process on faith; the code is public for people to evaluate.

### What did I work on myself?

My contribution was not limited to asking AI to “make an anime app.” It included:

- **Product direction:** deciding what Tatakai should be, what problems it should solve, and which features belong in the application.
- **Research and documentation:** studying API documentation and existing projects to understand integration requirements and limitations.
- **System planning:** creating flowcharts, defining workflows, and thinking through the architecture before implementation.
- **UI/UX direction:** planning the interface and user flows, using my design work and Figma skills to guide frontend development.
- **Backend, APIs, and scraping:** working on the data and integration side of the project rather than delegating the entire application to AI.
- **Integration and debugging:** connecting the frontend to the underlying systems, investigating failures, and making changes when generated code did not work as expected.
- **Testing and review:** repeatedly testing features, checking behavior, reviewing code, and identifying technical debt that still needs improvement.

**The distinction matters:** writing code is one part of software engineering; deciding what the code must do, integrating it, validating it, and maintaining it are also real work.

### How much of the frontend is AI-generated?

A substantial amount of the frontend implementation was generated with AI assistance. I used it to accelerate writing components and implementing interfaces based on the flows and design direction I had already worked out.

I don't want to downplay that contribution. Some generated code still needs cleanup and refactoring, and I would rather acknowledge that than pretend the codebase is perfect.

### Why use AI if you know how to code?

Because I wanted to experiment with a different workflow and learn from it.

I'm a student, still improving my programming and software engineering skills. This project gave me an opportunity to practice planning systems, working with APIs, designing interfaces, troubleshooting integrations, and testing a real application. I also wanted to see how far AI-assisted frontend development could go—and where it would fall short.

Knowing how to code and choosing to use AI are not mutually exclusive.

### Is Tatakai a “vibe-coded” app?

That depends on what someone means by the term. If it simply means **AI was used to generate code**, then yes, AI played a significant role, and I have no reason to deny it.

But if it means **a project built without planning, understanding, testing, or developer involvement**, that does not describe the process I followed.

Tatakai involved research, architectural decisions, UI/UX planning, integration work, debugging, and manual review. AI was a development tool, not a substitute for taking responsibility for the result.

Ultimately, **judge Tatakai by its code, functionality, reliability, and how issues are handled—not only by whether AI was used.**

## How I built the project

Here is a simplified version of my workflow:

1. **Learn the fundamentals.** Build enough programming knowledge to understand APIs, application structure, and what needs to happen behind the interface.
2. **Research existing systems.** Read documentation, including resources such as the [HiAnime API project](https://github.com/yahyaMomin/hianime-API), along with other API references.
3. **Map the requirements.** Decide on core features, dependencies, constraints, and expected behavior.
4. **Create flowcharts and architecture plans.** Work through how the different parts of the application should communicate.
5. **Define boundaries.** Write down technical requirements, edge cases, and approaches to avoid.
6. **Design the experience.** Plan layouts, navigation, and user workflows before translating them into frontend components.
7. **Implement with AI assistance.** Use AI heavily on the frontend, review its output, and guide iterations. Some of these coding sessions lasted roughly **6–8 hours**.
8. **Debug and test.** Work through broken behavior and integration problems. Some testing and debugging sessions lasted **12 hours or more**.
9. **Manually review the code.** Spend additional time inspecting the implementation, identifying weak areas, and deciding what needs refactoring; some review sessions took around **4 hours**.
10. **Release and gather feedback.** Share Tatakai publicly, ask users for criticism, investigate bugs, and continue improving it.

These are examples of individual work sessions, **not a claim that the entire project took only a few hours**. Development has been an iterative process.

## What I am not claiming

To avoid any confusion:

- I am **not** claiming that every line of Tatakai was written manually.
- I am **not** claiming that AI contributed only a few minor suggestions; it was heavily involved in frontend implementation.
- I am **not** claiming the application is bug-free or that every implementation decision is ideal.
- I am **not** claiming that using AI is equivalent to independently writing all the code.

What I **am** saying is that I took part in the engineering process beyond generating code: planning, design direction, backend and API work, integration, debugging, testing, and iteration.

## Final thoughts

Tatakai is a personal, open-source project built for learning and for the community. I am not building it to monetize users through advertisements, and I welcome constructive criticism—especially specific bug reports, code reviews, and suggestions.

You are completely free to decide whether you want to use software developed with AI assistance. I only ask that you evaluate the actual work and be fair about what AI did and what the developer did.

If Tatakai is useful to you, consider [starring the repository on GitHub](https://github.com/Snozxyx/Tatakai). If you find something broken or poorly implemented, please open an issue or suggest a fix.

**AI helped me write parts of Tatakai. It did not make the decisions, own the project, or take responsibility for maintaining it. I do.**

— **[Snozxyx](https://github.com/snozxyx)**
